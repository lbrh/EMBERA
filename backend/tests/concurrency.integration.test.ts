import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Pool } from 'pg';
import { ingestionRouter } from '../src/routes/ingestion.routes.ts';
import { deleteImage } from '../src/storage/cos.service.ts';
import { testImage } from './test-image.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
after(() => pool.end());

function startServer() {
    const app = express();
    app.use(ingestionRouter);
    return new Promise<{ close: () => void; url: string }>((resolve) => {
        const server = app.listen(0, () => {
            const { port } = server.address() as AddressInfo;
            resolve({ close: () => server.close(), url: `http://127.0.0.1:${port}` });
        });
    });
}

async function ingestForm(bytes: string, latitude: string, longitude: string, timestamp: string) {
    const form = new FormData();
    form.append('image', new Blob([await testImage(bytes)]), 'photo.jpg');
    form.append('source_type', 'citizen');
    form.append('latitude', latitude);
    form.append('longitude', longitude);
    form.append('timestamp', timestamp);
    return form;
}

test('two concurrent uploads in the same area/window attach to one incident, not two', async () => {
    const { close, url } = await startServer();
    const timestamp = '2026-09-19T00:00:00.000Z';
    const tag = Date.now();
    try {
        const [resA, resB] = await Promise.all([
            fetch(`${url}/ingest`, { method: 'POST', body: await ingestForm(`concurrency-a-${tag}`, '-37.810', '144.910', timestamp) }),
            fetch(`${url}/ingest`, { method: 'POST', body: await ingestForm(`concurrency-b-${tag}`, '-37.811', '144.911', timestamp) }),
        ]);
        assert.equal(resA.status, 201);
        assert.equal(resB.status, 201);
        const bodyA = await resA.json();
        const bodyB = await resB.json();

        assert.equal(bodyA.incidentId, bodyB.incidentId, 'both uploads should have grouped into the same incident');

        await deleteImage(bodyA.storagePath);
        await deleteImage(bodyB.storagePath);
        await pool.query('DELETE FROM images WHERE image_id = ANY($1)', [[bodyA.imageId, bodyB.imageId]]);
    } finally {
        close();
    }
});

test('a photo next to a closed (archived) incident starts a new incident instead of joining it', async () => {
    const { close, url } = await startServer();
    const timestamp = '2026-09-19T03:00:00.000Z';
    const tag = Date.now();
    try {
        const resA = await fetch(`${url}/ingest`, { method: 'POST', body: await ingestForm(`closed-a-${tag}`, '-37.830', '144.930', timestamp) });
        const bodyA = await resA.json();
        await pool.query(`INSERT INTO incident_dispatch (incident_id, state, updated_by) VALUES ($1, 'archived', 'test')`, [bodyA.incidentId]);

        const resB = await fetch(`${url}/ingest`, { method: 'POST', body: await ingestForm(`closed-b-${tag}`, '-37.831', '144.931', timestamp) });
        const bodyB = await resB.json();

        assert.notEqual(bodyB.incidentId, bodyA.incidentId);

        await deleteImage(bodyA.storagePath);
        await deleteImage(bodyB.storagePath);
        await pool.query('DELETE FROM images WHERE image_id = ANY($1)', [[bodyA.imageId, bodyB.imageId]]);
        await pool.query('DELETE FROM incident_dispatch WHERE incident_id = $1', [bodyA.incidentId]);
    } finally {
        close();
    }
});
