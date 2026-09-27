import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import * as metadataRepository from '../src/metadata/metadata.repository.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
after(() => pool.end());

async function incidentWith(images: number): Promise<{ incidentId: string; imageIds: string[] }> {
    const incidentId = randomUUID();
    const imageIds = Array.from({ length: images }, () => randomUUID());
    for (const imageId of imageIds) {
        await pool.query(
            `INSERT INTO images (image_id, incident_id, "timestamp", source_type, latitude, longitude, assessment_status, upload_status)
             VALUES ($1, $2, now(), 'citizen', -37.5, 145.3, 'assessed', 'stored')`,
            [imageId, incidentId],
        );
    }
    return { incidentId, imageIds };
}

async function cleanUp(incidentIds: string[]) {
    for (const table of ['images', 'incident_dispatch', 'decisions', 'comments']) {
        await pool.query(`DELETE FROM ${table} WHERE incident_id = ANY($1)`, [incidentIds]);
    }
}

test('merging moves images, comments and history across, keeps it live, and removes the source', async () => {
    const source = await incidentWith(1);
    const target = await incidentWith(2);
    const touched = [source.incidentId, target.incidentId];
    try {
        await metadataRepository.setDispatchState(source.incidentId, 'live', 'test');
        await metadataRepository.addComment(source.incidentId, 'test', 'smoke seen from the ridge');

        assert.deepEqual(await metadataRepository.mergeIncidents(source.incidentId, target.incidentId, 'test'), { incidentId: target.incidentId });

        assert.equal((await metadataRepository.findByIncidentId(source.incidentId)).length, 0);
        const merged = await metadataRepository.findByIncidentId(target.incidentId);
        assert.equal(merged.length, 3);
        assert.ok(merged.every((image) => image.dispatchState === 'live'));
        assert.equal((await metadataRepository.findComments(target.incidentId))[0].body, 'smoke seen from the ridge');
        const fields = (await metadataRepository.findDecisions(target.incidentId)).map((d) => d.field);
        assert.ok(fields.includes('mergedFrom') && fields.includes('dispatchState'));
        const { rowCount } = await pool.query('SELECT 1 FROM incident_dispatch WHERE incident_id = $1', [source.incidentId]);
        assert.equal(rowCount, 0);
    } finally {
        await cleanUp(touched);
    }
});

test('closed incidents do not merge', async () => {
    const source = await incidentWith(1);
    const target = await incidentWith(1);
    try {
        await metadataRepository.setDispatchState(target.incidentId, 'archived', 'test');
        await assert.rejects(metadataRepository.mergeIncidents(source.incidentId, target.incidentId, 'test'), metadataRepository.ConflictError);
        assert.equal((await metadataRepository.findByIncidentId(source.incidentId)).length, 1);
    } finally {
        await cleanUp([source.incidentId, target.incidentId]);
    }
});

test('splitting moves one image into a new incident, logged on both; a lone image cannot be split', async () => {
    const incident = await incidentWith(2);
    let newId = '';
    try {
        const result = await metadataRepository.splitImage(incident.imageIds[0], 'test');
        assert.ok(result);
        newId = result.incidentId;
        assert.notEqual(newId, incident.incidentId);
        assert.deepEqual((await metadataRepository.findByIncidentId(newId)).map((i) => i.imageId), [incident.imageIds[0]]);
        assert.equal((await metadataRepository.findByIncidentId(incident.incidentId)).length, 1);
        assert.equal((await metadataRepository.findDecisions(incident.incidentId))[0].field, 'splitTo');
        assert.equal((await metadataRepository.findDecisions(newId))[0].field, 'splitFrom');

        await assert.rejects(metadataRepository.splitImage(incident.imageIds[1], 'test'), metadataRepository.ConflictError);
    } finally {
        await cleanUp([incident.incidentId, newId].filter(Boolean));
    }
});
