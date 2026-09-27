import { createHash } from 'node:crypto';
import { newIncidentId, newImageId } from '../utils/ids.ts';
import { buildObjectKey, uploadImage } from '../storage/cos.service.ts';
import * as metadataRepository from '../metadata/metadata.repository.ts';
import { extractExif } from './exif.ts';
import { validateIngestion, assertReadableImage } from './validate.ts';
import { findIncidentToAttachTo } from './group-incident.ts';
import { lookUpPlaceName } from './place-name.ts';
import { lookUpFireWeather } from './fire-weather.ts';
import { INDICATOR_MODELS, classifyIndicator, isIndicatorConfigured, type Indicator } from '../ai/indicator-models.ts';
import { assessSeverity, type IndicatorReadings, type IndicatorConfidences } from './assess-severity.ts';
import { logger, errorMeta } from '../utils/logger.ts';
import type { IngestionInput, ImageMetadata } from '../metadata/metadata.types.ts';

export interface IngestedFile {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
}

// Flow per docs/live/architecture.md section 2: fill gaps from EXIF,
// validate, create the pending metadata record, then write to storage and update status.
export async function processImage(input: IngestionInput, file: IngestedFile): Promise<ImageMetadata> {
    // Before anything is written, so a corrupt upload leaves nothing behind to clean up.
    await assertReadableImage(file.buffer);
    const exif = await extractExif(file.buffer);
    const merged: IngestionInput = {
        sourceType: input.sourceType,
        latitude: input.latitude ?? exif.latitude,
        longitude: input.longitude ?? exif.longitude,
        timestamp: input.timestamp ?? exif.timestamp,
        incidentId: input.incidentId,
    };

    validateIngestion(merged);

    // Exact-duplicate resubmission (same bytes) attaches to nothing new — the addendum's
    // second dedup check, alongside the spatial/temporal auto-grouping below.
    const contentHash = createHash('md5').update(file.buffer).digest('hex');
    const existing = await metadataRepository.findByContentHash(contentHash);
    if (existing) {
        return existing;
    }

    const imageId = newImageId();
    const ext = file.originalname.split('.').pop() || 'jpg';

    // Locked so two near-simultaneous uploads in the same area/window can't each miss
    // the other's not-yet-committed row and create two incidents instead of one.
    const pending = await metadataRepository.withIncidentGroupingLock(async () => {
        const incidentId =
            merged.incidentId ??
            (await findIncidentToAttachTo(merged.latitude, merged.longitude, merged.timestamp)) ??
            newIncidentId();

        return metadataRepository.create({
            incidentId,
            imageId,
            storagePath: null,
            timestamp: merged.timestamp,
            sourceType: merged.sourceType,
            latitude: merged.latitude,
            longitude: merged.longitude,
            severityScore: null,
            severityScoreOverride: null,
            overriddenBy: null,
            overriddenAt: null,
            confidenceScore: null,
            severityExplanation: null,
            smokeDensity: null,
            flameVisibility: null,
            vegetationImpact: null,
            infrastructureImpact: null,
            assessmentStatus: 'pending_review',
            classificationLabel: null,
            classificationLabelOverride: null,
            priorityRank: null,
            uploadStatus: 'pending',
            ingestionError: null,
            contentHash,
            placeName: null,
            weather: null,
        });
    });

    const key = buildObjectKey(pending.incidentId, merged.sourceType, merged.timestamp, imageId, ext);

    try {
        await uploadImage(key, file.buffer, file.mimetype);
        const stored = await metadataRepository.update(imageId, { storagePath: key, uploadStatus: 'stored' });

        // Fire-and-forget: whether ingestion holds the connection open for classification
        // is an explicitly open question in the interface doc; running it after the
        // response is already on its way avoids the /ingest call blocking on an ML call
        // with no agreed SLA yet. A coordinator can still override the result later
        // regardless of whether this finishes before or after the client sees the response.
        void classifyAndUpdate(stored, file.buffer);
        void nameAndUpdate(stored);

        return stored;
    } catch (err) {
        return await metadataRepository.update(imageId, {
            uploadStatus: 'failed',
            ingestionError: err instanceof Error ? err.message : String(err),
        });
    }
}

// Same fire-and-forget reasoning: a place name is nice to have, never worth delaying ingest for.
async function nameAndUpdate(record: ImageMetadata): Promise<void> {
    const placeName = await lookUpPlaceName(record.latitude, record.longitude);
    if (!placeName) return;
    try {
        await metadataRepository.update(record.imageId, { placeName });
    } catch (err) {
        logger.error('failed to write place name', errorMeta(err));
    }
}

async function classifyAndUpdate(record: ImageMetadata, imageBuffer: Buffer): Promise<void> {
    if (!record.storagePath) return;

    // Per-indicator watsonx.ai deployments (indicator-models.ts). Each configured one writes
    // its reading; once all four are in, the rubric score is computed and written too. The
    // weather lookup runs alongside, since the score needs it (assess-severity.ts applyFireDanger).
    const indicators = Object.keys(INDICATOR_MODELS) as Indicator[];
    const readings: Partial<IndicatorReadings> = {};
    const confidences: Partial<IndicatorConfidences> = {};
    const weatherLookup = lookUpFireWeather(record.latitude, record.longitude);
    await Promise.all(
        indicators.filter(isIndicatorConfigured).map(async (indicator) => {
            try {
                const prediction = await classifyIndicator(indicator, imageBuffer);
                (readings as Record<Indicator, string>)[indicator] = prediction.value;
                confidences[indicator] = prediction.confidence;
            } catch (err) {
                logger.error(`${indicator} classification failed`, errorMeta(err));
            }
        }),
    );
    const weather = await weatherLookup;

    try {
        if (indicators.every((indicator) => readings[indicator])) {
            // ponytail: no fire/non-fire classifier is deployed, so every image is scored as 'fire';
            // swap in a real classification_label once one exists.
            const result = assessSeverity({
                classificationLabel: 'fire',
                indicators: readings as IndicatorReadings,
                confidences: confidences as IndicatorConfidences,
                weather,
            });
            await metadataRepository.update(record.imageId, { ...result, weather });
        } else {
            await metadataRepository.update(record.imageId, { ...readings, weather });
        }
    } catch (err) {
        logger.error('failed to write indicator results', errorMeta(err));
    }
}
