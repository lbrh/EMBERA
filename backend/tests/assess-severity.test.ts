import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSeverity, calculateSeverityScore, classifyFromIndicators, reassessForWeather } from '../src/pipeline/assess-severity.ts';
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
    assert.match(raised.severityExplanation!, /McArthur FFDI 58 \(legacy Severe, wind 45 km\/h\), so raised from 2 to 3/);
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

test('smoke or flame at 2-4 (either one) is a fire; neither goes to manual review', () => {
    const none = { smokeDensity: 'none_or_haze', flameVisibility: 'no_visible_flame', vegetationImpact: 'dense_vegetation', infrastructureImpact: 'sparse_infrastructure' } as const;
    assert.equal(classifyFromIndicators({ ...none, smokeDensity: 'moderate' }), 'fire');
    assert.equal(classifyFromIndicators({ ...none, flameVisibility: 'some_flame' }), 'fire');
    assert.equal(classifyFromIndicators(none), 'uncertain');

    const confident = { smokeDensity: 0.95, flameVisibility: 0.95, vegetationImpact: 0.95, infrastructureImpact: 0.95 };
    const result = assessSeverity({ classificationLabel: classifyFromIndicators(none), indicators: none, confidences: confident });
    assert.equal(result.classificationLabel, 'uncertain');
    assert.equal(result.assessmentStatus, 'unable_to_assess'); // manual review, even at high confidence
    assert.match(result.severityExplanation!, /no smoke or flame detected/);
});

test('a weather refresh re-applies fire danger to the stored readings and keeps the review note', () => {
    const scored = assessSeverity({ ...moderateFire, weather: weather(10) }); // severity 2
    const stored = { ...scored, severityExplanation: `${scored.severityExplanation} Routed for manual review — smoke/flame confidence 0.7.` };

    const worse = reassessForWeather(stored as never, weather(80));
    assert.equal(worse.severityScore, 3);
    assert.match(worse.severityExplanation!, /raised from 2 to 3\. Routed for manual review — smoke\/flame confidence/);

    const calmer = reassessForWeather({ ...stored, severityScore: 3 } as never, weather(10));
    assert.equal(calmer.severityScore, 2);

    const unscored = reassessForWeather({ ...stored, severityScore: null } as never, weather(80));
    assert.deepEqual([unscored.severityScore, unscored.weather?.ffdi], [null, 80]);
});

test('confidence is the mean of smoke and flame; vegetation and infrastructure do not count', () => {
    const result = assessSeverity({
        ...moderateFire,
        confidences: { smokeDensity: 0.9, flameVisibility: 0.7, vegetationImpact: 0.1, infrastructureImpact: 0.1 },
    });
    assert.equal(result.confidenceScore, 0.8);
    assert.equal(result.assessmentStatus, 'assessed');

    const low = assessSeverity({ ...moderateFire, confidences: { ...moderateFire.confidences, smokeDensity: 0.8, flameVisibility: 0.7 } });
    assert.equal(low.confidenceScore, 0.75); // exactly at the threshold -> review
    assert.equal(low.assessmentStatus, 'unable_to_assess');
    assert.match(low.severityExplanation!, /smoke\/flame confidence 0\.75/);
});
