import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expireStalePendingAssessments } from '../src/metadata/metadata.repository.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
after(() => pool.end());

test('an assessment still pending after the cutoff goes to manual review; a recent one is left alone', async () => {
    const incidentId = randomUUID();
    const [stale, fresh] = [randomUUID(), randomUUID()];
    const insert = (imageId: string, age: string) =>
        pool.query(
            `INSERT INTO images (image_id, incident_id, "timestamp", source_type, latitude, longitude, assessment_status, upload_status, created_at)
             VALUES ($1, $2, now(), 'citizen', -37.8, 144.9, 'pending_review', 'stored', now() - $3::interval)`,
            [imageId, incidentId, age],
        );
    await insert(stale, '11 minutes');
    await insert(fresh, '1 minute');

    try {
        await expireStalePendingAssessments(10);
        const { rows } = await pool.query('SELECT image_id, assessment_status, severity_explanation FROM images WHERE incident_id = $1', [incidentId]);
        const byId = Object.fromEntries(rows.map((r) => [r.image_id, r]));
        assert.equal(byId[stale].assessment_status, 'unable_to_assess');
        assert.match(byId[stale].severity_explanation, /did not finish/);
        assert.equal(byId[fresh].assessment_status, 'pending_review');
    } finally {
        await pool.query('DELETE FROM images WHERE incident_id = $1', [incidentId]);
    }
});
