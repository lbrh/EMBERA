import sharp from 'sharp';
import { logger, errorMeta } from '../utils/logger.ts';
import type { IngestionInput } from '../metadata/metadata.types.ts';

const SOURCE_TYPES = new Set(['drone', 'cctv', 'citizen', 'satellite', 'crew']);

// ponytail: placeholder region (Victoria, AU) — the addendum flags the real operating
// bounding box as still undecided, pending client input. Swap these four numbers for
// the confirmed region once given; nothing else here needs to change.
const REGION_BOUNDS = { minLat: -39.2, maxLat: -33.98, minLon: 140.96, maxLon: 150.03 };

export class ValidationError extends Error {}

export type ValidatedIngestionInput = Required<Pick<IngestionInput, 'sourceType' | 'latitude' | 'longitude' | 'timestamp'>> &
    IngestionInput;

// Per docs/live/architecture.md section 2: location + timestamp
// must be present and coordinates must fall within the operating region's bounding box.
export function validateIngestion(input: IngestionInput): asserts input is ValidatedIngestionInput {
    if (!input.sourceType || !SOURCE_TYPES.has(input.sourceType)) {
        throw new ValidationError(`source_type is required and must be one of ${[...SOURCE_TYPES].join(', ')}`);
    }
    if (input.latitude === undefined || input.longitude === undefined) {
        throw new ValidationError('latitude and longitude are required');
    }
    if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
        throw new ValidationError('latitude/longitude out of range');
    }
    if (
        input.latitude < REGION_BOUNDS.minLat ||
        input.latitude > REGION_BOUNDS.maxLat ||
        input.longitude < REGION_BOUNDS.minLon ||
        input.longitude > REGION_BOUNDS.maxLon
    ) {
        throw new ValidationError('latitude/longitude outside the operating region');
    }

    if (!input.timestamp) {
        throw new ValidationError('timestamp is required');
    }
}

// Fully decodes the image, so a truncated or corrupt file is rejected before anything is
// stored (sharp's default failOn: 'warning' also catches "premature end of JPEG").
export async function assertReadableImage(buffer: Buffer): Promise<void> {
    try {
        await sharp(buffer).stats();
    } catch (err) {
        logger.warn('corrupt upload rejected', errorMeta(err));
        throw new ValidationError('image file is corrupt or unreadable, please upload it again');
    }
}
