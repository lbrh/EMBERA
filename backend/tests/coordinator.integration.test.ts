import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Pool } from 'pg';
import { coordinatorRouter } from '../src/routes/coordinator.routes.ts';
import { incidentsRouter } from '../src/routes/incidents.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
after(() => pool.end());

function startServer(caller: string) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        res.locals.caller = caller; // stands in for requireApiKey
        next();
    });
    app.use(coordinatorRouter);
    app.use(incidentsRouter);
    return new Promise<{ close: () => void; url: string }>((resolve) => {
        const server = app.listen(0, () => {
            const { port } = server.address() as AddressInfo;
            resolve({ close: () => server.close(), url: `http://127.0.0.1:${port}` });
        });
    });
}

// Inserts a flagged (below-threshold) image directly — no COS upload needed for these routes.
async function seedFlaggedImage() {
    const incidentId = randomUUID();
    const imageId = randomUUID();
    await pool.query(
        `INSERT INTO images (image_id, incident_id, "timestamp", source_type, latitude, longitude,
            severity_score, confidence_score, assessment_status, classification_label, upload_status)
         VALUES ($1, $2, now(), 'citizen', -37.8, 144.9, 3, 0.6, 'unable_to_assess', 'fire', 'stored')`,
        [imageId, incidentId],
    );
    return { incidentId, imageId };
}

async function cleanup(incidentId: string) {
    await pool.query('DELETE FROM decisions WHERE incident_id = $1', [incidentId]);
    await pool.query('DELETE FROM comments WHERE incident_id = $1', [incidentId]);
    await pool.query('DELETE FROM assignments WHERE incident_id = $1', [incidentId]);
    await pool.query('DELETE FROM support_requests WHERE incident_id = $1', [incidentId]);
    await pool.query('DELETE FROM incident_dispatch WHERE incident_id = $1', [incidentId]);
    await pool.query('DELETE FROM images WHERE incident_id = $1', [incidentId]);
}

const json = (method: string, body: unknown) => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
});

test('review confirm, undo, dispatch and extinguish are applied, logged, and visible on the incident', async () => {
    const { close, url } = await startServer('frontend');
    const { incidentId, imageId } = await seedFlaggedImage();
    try {
        // confirm the AI's provisional tag
        let res = await fetch(
            `${url}/images/${imageId}/decision`,
            json('PATCH', { severityScoreOverride: 3, classificationLabelOverride: 'fire', assessmentStatus: 'assessed', by: 'EC' }),
        );
        assert.equal(res.status, 200);
        let image = await res.json();
        assert.equal(image.severityScoreOverride, 3);
        assert.equal(image.assessmentStatus, 'assessed');
        assert.equal(image.severityScore, 3, 'AI output is never overwritten');
        assert.equal(image.overriddenBy, 'EC');

        // undo = send the previous values back
        res = await fetch(
            `${url}/images/${imageId}/decision`,
            json('PATCH', { severityScoreOverride: null, classificationLabelOverride: null, assessmentStatus: 'unable_to_assess', by: 'EC' }),
        );
        image = await res.json();
        assert.equal(image.severityScoreOverride, null);
        assert.equal(image.assessmentStatus, 'unable_to_assess');

        // dispatch, then extinguish
        for (const state of ['live', 'extinguished']) {
            res = await fetch(`${url}/incidents/${incidentId}/dispatch`, json('PUT', { state, by: 'EC' }));
            assert.equal(res.status, 200);
        }

        // the incident read now carries the dispatch state
        const images = await fetch(`${url}/incidents/${incidentId}`).then((r) => r.json());
        assert.equal(images[0].dispatchState, 'extinguished');

        // 3 fields confirmed + 3 undone + 2 dispatch changes, newest first, with before/after
        const decisions = await fetch(`${url}/incidents/${incidentId}/decisions`).then((r) => r.json());
        assert.equal(decisions.length, 8);
        assert.deepEqual(
            { field: decisions[0].field, from: decisions[0].fromValue, to: decisions[0].toValue, by: decisions[0].decidedBy },
            { field: 'dispatchState', from: 'live', to: 'extinguished', by: 'EC' },
        );
        assert.ok(decisions.some((d: { field: string; fromValue: string; toValue: string }) =>
            d.field === 'severityScoreOverride' && d.fromValue === null && d.toValue === '3'));
    } finally {
        close();
        await cleanup(incidentId);
    }
});

test('a no-op decision logs nothing, unknown ids 404, bad input 400', async () => {
    const { close, url } = await startServer('frontend');
    const { incidentId, imageId } = await seedFlaggedImage();
    try {
        await fetch(`${url}/images/${imageId}/decision`, json('PATCH', { assessmentStatus: 'unable_to_assess', by: 'EC' }));
        const decisions = await fetch(`${url}/incidents/${incidentId}/decisions`).then((r) => r.json());
        assert.equal(decisions.length, 0);

        assert.equal((await fetch(`${url}/images/${randomUUID()}/decision`, json('PATCH', { assessmentStatus: 'assessed', by: 'EC' }))).status, 404);
        assert.equal((await fetch(`${url}/images/not-a-uuid/decision`, json('PATCH', { assessmentStatus: 'assessed', by: 'EC' }))).status, 404);
        assert.equal((await fetch(`${url}/incidents/${randomUUID()}/dispatch`, json('PUT', { state: 'live', by: 'EC' }))).status, 404);
        assert.equal((await fetch(`${url}/incidents/${incidentId}/dispatch`, json('PUT', { state: 'on_fire', by: 'EC' }))).status, 400);
    } finally {
        close();
        await cleanup(incidentId);
    }
});

test('only the frontend caller may make coordinator decisions', async () => {
    const { close, url } = await startServer('classifier');
    const { incidentId, imageId } = await seedFlaggedImage();
    try {
        const res = await fetch(`${url}/images/${imageId}/decision`, json('PATCH', { assessmentStatus: 'assessed', by: 'EC' }));
        assert.equal(res.status, 403);
    } finally {
        close();
        await cleanup(incidentId);
    }
});

test('comments are added to an incident and listed newest first', async () => {
    const { close, url } = await startServer('frontend');
    const { incidentId } = await seedFlaggedImage();
    try {
        for (const body of ['Crew en route', 'Wind has changed to the north']) {
            const res = await fetch(`${url}/incidents/${incidentId}/comments`, json('POST', { body, by: 'EC' }));
            assert.equal(res.status, 201);
        }
        const comments = await fetch(`${url}/incidents/${incidentId}/comments`).then((r) => r.json());
        assert.deepEqual(
            comments.map((c: { body: string; author: string }) => [c.body, c.author]),
            [['Wind has changed to the north', 'EC'], ['Crew en route', 'EC']],
        );

        assert.equal((await fetch(`${url}/incidents/${randomUUID()}/comments`, json('POST', { body: 'hi', by: 'EC' }))).status, 404);
        assert.equal((await fetch(`${url}/incidents/${incidentId}/comments`, json('POST', { body: '', by: 'EC' }))).status, 400);
    } finally {
        close();
        await cleanup(incidentId);
    }
});

// Crews of its own, so the test never races real (seeded) crews someone is using on staging.
async function seedCrews(count: number) {
    const stationId = randomUUID();
    await pool.query(`INSERT INTO stations (station_id, name, latitude, longitude) VALUES ($1, $2, -37.5, 145.3)`, [stationId, `Test ${stationId}`]);
    const crewIds: string[] = [];
    for (let n = 1; n <= count; n++) {
        const crewId = randomUUID();
        await pool.query(`INSERT INTO crews (crew_id, station_id, label, crew_type) VALUES ($1, $2, $3, 'heavy')`, [crewId, stationId, `Test Heavy ${n} ${crewId}`]);
        crewIds.push(crewId);
    }
    return {
        crewIds,
        remove: async () => {
            await pool.query('DELETE FROM support_requests WHERE crew_id = ANY($1::uuid[])', [crewIds]);
            await pool.query('DELETE FROM assignments WHERE crew_id = ANY($1::uuid[])', [crewIds]);
            await pool.query('DELETE FROM crews WHERE station_id = $1', [stationId]);
            await pool.query('DELETE FROM stations WHERE station_id = $1', [stationId]);
        },
    };
}

test('crews are dispatched, recalled and freed when the incident is extinguished', async () => {
    const { close, url } = await startServer('frontend');
    const first = await seedFlaggedImage();
    const second = await seedFlaggedImage();
    const { crewIds: [a, b], remove } = await seedCrews(2);
    const dispatchState = async (incidentId: string) =>
        (await fetch(`${url}/incidents/${incidentId}`).then((r) => r.json()))[0].dispatchState;
    const assignmentOf = async (crewId: string) =>
        (await fetch(`${url}/crews`).then((r) => r.json())).find((c: { crewId: string }) => c.crewId === crewId).assignment;
    try {
        // two crews to the first incident: it goes live, both crews are out
        let res = await fetch(`${url}/incidents/${first.incidentId}/assignments`, json('POST', { crewIds: [a, b], by: 'EC' }));
        assert.equal(res.status, 201);
        assert.equal(await dispatchState(first.incidentId), 'live');
        assert.equal((await assignmentOf(a)).incidentId, first.incidentId);

        // a busy crew can't go to a second incident, and nothing of that dispatch is kept
        res = await fetch(`${url}/incidents/${second.incidentId}/assignments`, json('POST', { crewIds: [a], by: 'EC' }));
        assert.equal(res.status, 409);
        assert.equal(await dispatchState(second.incidentId), null);

        // steps go forward only
        const assignmentA = (await assignmentOf(a)).assignmentId;
        assert.equal((await fetch(`${url}/assignments/${assignmentA}`, json('PATCH', { status: 'on_scene', by: 'Crew' }))).status, 409);
        assert.equal((await fetch(`${url}/assignments/${assignmentA}`, json('PATCH', { status: 'en_route', by: 'Crew' }))).status, 200);

        // recall one crew: still live; recall the last: back to awaiting
        await fetch(`${url}/assignments/${assignmentA}`, json('PATCH', { status: 'cleared', by: 'EC' }));
        assert.equal(await assignmentOf(a), null);
        assert.equal(await dispatchState(first.incidentId), 'live');
        await fetch(`${url}/assignments/${(await assignmentOf(b)).assignmentId}`, json('PATCH', { status: 'cleared', by: 'EC' }));
        assert.equal(await dispatchState(first.incidentId), 'awaiting');

        // dispatch again, then extinguish: the crew is freed with it
        await fetch(`${url}/incidents/${first.incidentId}/assignments`, json('POST', { crewIds: [a], by: 'EC' }));
        await fetch(`${url}/incidents/${first.incidentId}/dispatch`, json('PUT', { state: 'extinguished', by: 'Crew' }));
        assert.equal(await assignmentOf(a), null);

        const decisions = await fetch(`${url}/incidents/${first.incidentId}/decisions`).then((r) => r.json());
        assert.deepEqual(
            { field: decisions[0].field.startsWith('crew:'), from: decisions[0].fromValue, to: decisions[0].toValue },
            { field: true, from: 'dispatched', to: 'cleared' },
        );

        assert.equal((await fetch(`${url}/incidents/${randomUUID()}/assignments`, json('POST', { crewIds: [a], by: 'EC' }))).status, 404);
        assert.equal((await fetch(`${url}/assignments/999999999999`, json('PATCH', { status: 'cleared', by: 'EC' }))).status, 404);
        assert.equal((await fetch(`${url}/incidents/${first.incidentId}/assignments`, json('POST', { crewIds: [randomUUID()], by: 'EC' }))).status, 400);
    } finally {
        close();
        await remove();
        await cleanup(first.incidentId);
        await cleanup(second.incidentId);
    }
});

test('support requests: only an assigned crew asks, a new crew fulfils it, a finished fire dismisses it', async () => {
    const { close, url } = await startServer('frontend');
    const { incidentId } = await seedFlaggedImage();
    const { crewIds: [onScene, backup, outsider], remove } = await seedCrews(3);
    const open = async () =>
        (await fetch(`${url}/support-requests`).then((r) => r.json())).filter((r: { incidentId: string }) => r.incidentId === incidentId);
    const ask = (crewId: string) =>
        fetch(`${url}/incidents/${incidentId}/support-requests`, json('POST', { crewId, crewType: 'heavy', note: 'eastern flank', by: 'Crew' }));
    try {
        await fetch(`${url}/incidents/${incidentId}/assignments`, json('POST', { crewIds: [onScene], by: 'EC' }));
        assert.equal((await ask(outsider)).status, 409, 'a crew not on the incident cannot ask');

        assert.equal((await ask(onScene)).status, 201);
        const [request] = await open();
        assert.deepEqual([request.crewType, request.note, request.status], ['heavy', 'eastern flank', 'open']);

        // dispatching another crew answers it
        await fetch(`${url}/incidents/${incidentId}/assignments`, json('POST', { crewIds: [backup], by: 'EC' }));
        assert.equal((await open()).length, 0);

        // a dismissed request leaves the alerts; a finished fire dismisses what's still open
        await ask(onScene);
        const [second] = await open();
        assert.equal((await fetch(`${url}/support-requests/${second.id}`, json('PATCH', { status: 'dismissed', by: 'EC' }))).status, 200);
        assert.equal((await open()).length, 0);
        await ask(onScene);
        await fetch(`${url}/incidents/${incidentId}/dispatch`, json('PUT', { state: 'extinguished', by: 'Crew' }));
        assert.equal((await open()).length, 0);
    } finally {
        close();
        await cleanup(incidentId);
        await remove();
    }
});
