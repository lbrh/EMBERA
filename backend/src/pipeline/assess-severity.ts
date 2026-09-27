import { ValidationError } from './validate.ts';
import { SEVERE_FFDI, dangerRating } from './fire-weather.ts';
import type {
    FireWeather,
    ImageMetadata,
    ClassificationLabel,
    SmokeDensity,
    FlameVisibility,
    VegetationImpact,
    InfrastructureImpact,
} from '../metadata/metadata.types.ts';

// 1-4 weight per indicator reading per requirements
const SMOKE_WEIGHT: Record<SmokeDensity, 1 | 2 | 3 | 4> = {
    none_or_haze: 1,
    moderate: 2,
    dense_dark: 3,
    very_dense_blocking_vision: 4,
};
const FLAME_WEIGHT: Record<FlameVisibility, 1 | 2 | 3 | 4> = {
    no_visible_flame: 1,
    some_flame: 2,
    visible_high_flames_and_embers: 3,
    large_flame_wall_embers_everywhere: 4,
};
const VEGETATION_WEIGHT: Record<VegetationImpact, 1 | 2 | 3 | 4> = {
    no_vegetation: 1,
    sparse_vegetation: 2,
    moderate_vegetation: 3,
    dense_vegetation: 4,
};

const INFRASTRUCTURE_WEIGHT: Record<InfrastructureImpact, 1 | 2 | 3 | 4> = {
    no_infrastructure: 1,
    sparse_infrastructure: 2,
    moderate_infrastructure: 3,
    dense_infrastructure: 4,
};

export interface IndicatorReadings {
    smokeDensity: SmokeDensity;
    flameVisibility: FlameVisibility;
    vegetationImpact: VegetationImpact;
    infrastructureImpact: InfrastructureImpact;
}

export type IndicatorConfidences = Record<keyof IndicatorReadings, number>;

const CLASSIFICATION_LABELS = new Set<ClassificationLabel>(['fire', 'non_fire', 'extinguished', 'uncertain']);

function assertEnumField<T extends string>(
    body: Record<string, unknown>,
    field: string,
    valid: Record<T, unknown>,
): T {
    const value = body[field];
    if (typeof value !== 'string' || !(value in valid)) {
        throw new ValidationError(`${field} must be one of ${Object.keys(valid).join(', ')}`);
    }
    return value as T;
}

function assertConfidence(confidences: Record<string, unknown>, field: string): number {
    const value = confidences[field];
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
        throw new ValidationError(`confidences.${field} must be a number between 0 and 1`);
    }
    return value;
}

export function parseSeverityAssessmentInput(body: unknown): SeverityAssessmentInput {
    if (typeof body !== 'object' || body === null) {
        throw new ValidationError('request body must be a JSON object');
    }
    const b = body as Record<string, unknown>;

    const classificationLabelRaw = b.classification_label;
    if (typeof classificationLabelRaw !== 'string' || !CLASSIFICATION_LABELS.has(classificationLabelRaw as ClassificationLabel)) {
        throw new ValidationError(`classification_label must be one of ${[...CLASSIFICATION_LABELS].join(', ')}`);
    }
    const classificationLabel = classificationLabelRaw as ClassificationLabel;

    if (classificationLabel === 'non_fire' || classificationLabel === 'extinguished') {
        return { classificationLabel, indicators: {} as IndicatorReadings, confidences: {} as IndicatorConfidences };
    }

    const smokeDensity = assertEnumField(b, 'smoke_density', SMOKE_WEIGHT);
    const flameVisibility = assertEnumField(b, 'flame_visibility', FLAME_WEIGHT);
    const vegetationImpact = assertEnumField(b, 'vegetation_impact', VEGETATION_WEIGHT);
    const infrastructureImpact = assertEnumField(b, 'infrastructure_impact', INFRASTRUCTURE_WEIGHT);

    const confidencesRaw = b.confidences;
    if (typeof confidencesRaw !== 'object' || confidencesRaw === null) {
        throw new ValidationError('confidences must be an object with smokeDensity/flameVisibility/vegetationImpact/infrastructureImpact');
    }
    const c = confidencesRaw as Record<string, unknown>;

    return {
        classificationLabel,
        indicators: { smokeDensity, flameVisibility, vegetationImpact, infrastructureImpact },
        confidences: {
            smokeDensity: assertConfidence(c, 'smokeDensity'),
            flameVisibility: assertConfidence(c, 'flameVisibility'),
            vegetationImpact: assertConfidence(c, 'vegetationImpact'),
            infrastructureImpact: assertConfidence(c, 'infrastructureImpact'),
        },
    };
}

// Vegetation is fuel: it only adds to severity when there's any smoke or flame, otherwise it
// counts 0 (a green hillside with no fire isn't a hazard). Total range 3-16.
function effectiveVegetationWeight(indicators: IndicatorReadings): 0 | 1 | 2 | 3 | 4 {
    const fire = SMOKE_WEIGHT[indicators.smokeDensity] > 1 || FLAME_WEIGHT[indicators.flameVisibility] > 1;
    return fire ? VEGETATION_WEIGHT[indicators.vegetationImpact] : 0;
}

export function calculateSeverityScore(indicators: IndicatorReadings): 1 | 2 | 3 | 4 {
    const total =
        SMOKE_WEIGHT[indicators.smokeDensity] +
        FLAME_WEIGHT[indicators.flameVisibility] +
        effectiveVegetationWeight(indicators) +
        INFRASTRUCTURE_WEIGHT[indicators.infrastructureImpact];

    if (total <= 7) return 1;
    if (total <= 10) return 2;
    if (total <= 13) return 3;
    return 4;
}

export function calculateConfidenceScore(confidences: IndicatorConfidences): {
    confidenceScore: number;
    weakestIndicator: keyof IndicatorConfidences;
} {
    const entries = Object.entries(confidences) as [keyof IndicatorConfidences, number][];
    const [weakestIndicator, confidenceScore] = entries.reduce((min, entry) =>
        entry[1] < min[1] ? entry : min,
    );
    return { confidenceScore, weakestIndicator };
}


export function needsManualReview(confidenceScore: number): boolean {
    return confidenceScore <= 0.75;
}

function describeIndicator(label: string, weight: number): string {
    return `${label} at level ${weight}`;
}


function buildSeverityExplanation(indicators: IndicatorReadings, severityScore: 1 | 2 | 3 | 4): string {
    const weighted: [string, number][] = [
        ['smoke', SMOKE_WEIGHT[indicators.smokeDensity]],
        ['flame visibility', FLAME_WEIGHT[indicators.flameVisibility]],
        ['vegetation', effectiveVegetationWeight(indicators)],
        ['infrastructure impact', INFRASTRUCTURE_WEIGHT[indicators.infrastructureImpact]],
    ];
    const highest = Math.max(...weighted.map(([, weight]) => weight));
    const drivers = weighted.filter(([, weight]) => weight === highest).map(([label]) => label);

    return `Severity ${severityScore}, driven by ${drivers.map((label) => describeIndicator(label, highest)).join(' and ')}.`;
}

export interface SeverityAssessmentInput {
    classificationLabel: ClassificationLabel;
    indicators: IndicatorReadings;
    confidences: IndicatorConfidences;
    // Weather at the scene; null/absent = scored from the image alone.
    weather?: FireWeather | null;
}

// The image shows how bad the fire is now; the weather says how fast it can get worse. At Severe
// fire danger or above, one level is added (capped at 4) rather than blending weather into the
// indicator sum, so the image-only rubric stays readable and a coordinator can still see both.
export function applyFireDanger(imageScore: 1 | 2 | 3 | 4, weather: FireWeather | null | undefined): 1 | 2 | 3 | 4 {
    if (!weather || weather.ffdi < SEVERE_FFDI) return imageScore;
    return Math.min(4, imageScore + 1) as 1 | 2 | 3 | 4;
}

function describeFireDanger(imageScore: number, severityScore: number, weather: FireWeather | null | undefined): string {
    if (!weather || weather.ffdi < SEVERE_FFDI) return '';
    const raised = severityScore > imageScore ? `, so raised from ${imageScore} to ${severityScore}` : '';
    return ` McArthur FFDI ${weather.ffdi} (legacy ${dangerRating(weather.ffdi)}, wind ${Math.round(weather.windKmh)} km/h)${raised}.`;
}

export type SeverityAssessmentResult = Pick<
    ImageMetadata,
    | 'classificationLabel'
    | 'severityScore'
    | 'confidenceScore'
    | 'severityExplanation'
    | 'smokeDensity'
    | 'flameVisibility'
    | 'vegetationImpact'
    | 'infrastructureImpact'
    | 'assessmentStatus'
>;

export function assessSeverity({
    classificationLabel,
    indicators,
    confidences,
    weather,
}: SeverityAssessmentInput): SeverityAssessmentResult {
    if (classificationLabel === 'non_fire' || classificationLabel === 'extinguished') {
        return {
            classificationLabel,
            severityScore: null,
            confidenceScore: null,
            severityExplanation: null,
            smokeDensity: null,
            flameVisibility: null,
            vegetationImpact: null,
            infrastructureImpact: null,
            assessmentStatus: 'assessed',
        };
    }

    const imageScore = calculateSeverityScore(indicators);
    const severityScore = applyFireDanger(imageScore, weather);
    const { confidenceScore, weakestIndicator } = calculateConfidenceScore(confidences);
    const reviewNeeded = classificationLabel === 'uncertain' || needsManualReview(confidenceScore);

    const reviewReason =
        classificationLabel === 'uncertain'
            ? 'classification uncertain'
            : `lowest confidence on ${weakestIndicator} (${confidenceScore})`;
    const scored = buildSeverityExplanation(indicators, imageScore) + describeFireDanger(imageScore, severityScore, weather);
    const explanation = reviewNeeded ? `${scored} Routed for manual review — ${reviewReason}.` : scored;

    return {
        classificationLabel,
        severityScore,
        confidenceScore,
        severityExplanation: explanation,
        smokeDensity: indicators.smokeDensity,
        flameVisibility: indicators.flameVisibility,
        vegetationImpact: indicators.vegetationImpact,
        infrastructureImpact: indicators.infrastructureImpact,
        assessmentStatus: reviewNeeded ? 'unable_to_assess' : 'assessed',
    };
}
