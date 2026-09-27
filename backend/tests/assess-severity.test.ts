import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSeverity, calculateSeverityScore } from '../src/pipeline/assess-severity.ts';
import { forestFireDangerIndex } from '../src/pipeline/fire-weather.ts';

test('dense vegetation adds nothing when there is no smoke or flame', () => {
    const score = calculateSeverityScore({
        smokeDensity: 'none_or_haze',
        flameVisibility: 'no_visible_flame',
        vegetationImpact: 'dense_vegetation',
        infrastructureImpact: 'sparse_infrastructure',
    });
    assert.equal(score, 1); // 1 + 1 + 4*0 + 2 = 4
});

test('dense vegetation counts in full once there is smoke or flame', () => {
    const indicators = {
        smokeDensity: 'very_dense_blocking_vision',
        flameVisibility: 'visible_high_flames_and_embers',
        infrastructureImpact: 'no_infrastructure',
    } as const;
    assert.equal(calculateSeverityScore({ ...indicators, vegetationImpact: 'dense_vegetation' }), 3); // 4+3+4+1 = 12
    assert.equal(calculateSeverityScore({ ...indicators, vegetationImpact: 'no_vegetation' }), 2); // 4+3+1+1 = 9
});

test('smoke alone is enough to count vegetation', () => {
    const score = calculateSeverityScore({
        smokeDensity: 'moderate',
        flameVisibility: 'no_visible_flame',
        vegetationImpact: 'dense_vegetation',
        infrastructureImpact: 'sparse_infrastructure',
    });
    assert.equal(score, 2); // 2 + 1 + 4 + 2 = 9
});

test('FFDI matches the McArthur Mk5 formula at worst-case drought', () => {
    assert.equal(forestFireDangerIndex(30, 20, 30), 34.5); // Very high
    assert.ok(forestFireDangerIndex(40, 10, 50) > 100); // Catastrophic
    assert.ok(forestFireDangerIndex(15, 80, 5) < 12); // Low-moderate
});

const moderateFire = {
    classificationLabel: 'fire',
    indicators: {
        smokeDensity: 'moderate',
        flameVisibility: 'some_flame',
        vegetationImpact: 'moderate_vegetation',
        infrastructureImpact: 'sparse_infrastructure',
    },
    confidences: { smokeDensity: 0.9, flameVisibility: 0.9, vegetationImpact: 0.9, infrastructureImpact: 0.9 },
} as const; // 2+2+3+2 = 9 -> severity 2
const weather = (ffdi: number) => ({ observedAt: '', temperatureC: 0, humidityPct: 0, windKmh: 45, windFromDeg: 0, ffdi });

test('severe fire danger raises severity one level, lower danger leaves it alone', () => {
    assert.equal(assessSeverity(moderateFire).severityScore, 2);
    assert.equal(assessSeverity({ ...moderateFire, weather: null }).severityScore, 2);
    assert.equal(assessSeverity({ ...moderateFire, weather: weather(49.9) }).severityScore, 2);

    const raised = assessSeverity({ ...moderateFire, weather: weather(58) });
    assert.equal(raised.severityScore, 3);
    assert.match(raised.severityExplanation!, /Fire danger Severe \(FFDI 58, wind 45 km\/h\), so raised from 2 to 3/);
});

test('fire danger never pushes severity past 4', () => {
    const worst = {
        ...moderateFire,
        indicators: {
            smokeDensity: 'very_dense_blocking_vision',
            flameVisibility: 'large_flame_wall_embers_everywhere',
            vegetationImpact: 'dense_vegetation',
            infrastructureImpact: 'dense_infrastructure',
        },
    } as const;
    assert.equal(assessSeverity({ ...worst, weather: weather(120) }).severityScore, 4);
});
