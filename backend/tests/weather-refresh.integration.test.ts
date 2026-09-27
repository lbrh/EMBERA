import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import * as metadataRepository from '../src/metadata/metadata.repository.ts';
import type { FireWeather } from '../src/metadata/metadata.types.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
after(() => pool.end());

test('a refresh that changes the AI severity is written and logged; an unchanged one only updates weather', async () => {
    const [incidentId, imageId] = [randomUUID(), randomUUID()];
    await pool.query(
        `INSERT INTO images (image_id, incident_id, "timestamp", source_type, latitude, longitude, severity_score, assessment_status, upload_status)
         VALUES ($1, $2, now(), 'citizen', -37.5, 145.3, 2, 'assessed', 'stored')`,
        [imageId, incidentId],
    );
    const weather: FireWeather = { observedAt: new Date().toISOString(), temperatureC: 38, humidityPct: 8, windKmh: 50, windFromDeg: 315, ffdi: 110 };
    try {
        await metadataRepository.applyWeatherRefresh(imageId, { weather, severityScore: 3, severityExplanation: 'raised' }, 'Weather refresh');
        await metadataRepository.applyWeatherRefresh(imageId, { weather: { ...weather, ffdi: 111 }, severityScore: 3, severityExplanation: 'raised' }, 'Weather refresh');

        const image = await metadataRepository.get(imageId);
        assert.equal(image?.severityScore, 3);
        assert.equal(image?.weather?.ffdi, 111);
        const { rows } = await pool.query('SELECT field, from_value, to_value, decided_by FROM decisions WHERE image_id = $1', [imageId]);
        assert.deepEqual(rows, [{ field: 'severityScore', from_value: '2', to_value: '3', decided_by: 'Weather refresh' }]);
    } finally {
        await pool.query('DELETE FROM decisions WHERE image_id = $1', [imageId]);
        await pool.query('DELETE FROM images WHERE image_id = $1', [imageId]);
    }
});
