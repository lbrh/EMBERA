// Times a photo report end to end on the STAGING database: the same processImage() the /ingest
// route runs (validate, storage upload, database record), then the background AI scoring, until
// the incident reads as scored — what the coordinator's map shows on its next 5 s refresh.
//
//   1. Put the staging branch's connection string in backend/.env.staging.local (gitignored):
//        STAGING_DATABASE_URL=postgresql://...
//   2. npm --prefix backend run time-ingest            (default 10 photos; pass a number for more)
//
// Refuses to run when STAGING_DATABASE_URL matches the DATABASE_URL in backend/.env (production).
// Uploads go to the COS bucket in backend/.env and are deleted afterwards, along with the staging
// rows the run created.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(join(root, '.env'));
const production = process.env.DATABASE_URL;
if (existsSync(join(root, '.env.staging.local'))) process.loadEnvFile(join(root, '.env.staging.local'));
const staging = process.env.STAGING_DATABASE_URL;
if (!staging) throw new Error('Set STAGING_DATABASE_URL in backend/.env.staging.local');
if (production && new URL(staging).hostname.replace('-pooler', '') === new URL(production).hostname.replace('-pooler', '')) {
    throw new Error('STAGING_DATABASE_URL points at the same database as DATABASE_URL (production). Refusing to run.');
}
// Set before the pipeline modules load, so their connection pool opens on staging.
process.env.DATABASE_URL = staging;
process.env.WEATHER_REFRESH_MINUTES = '0';

const db = new pg.Pool({ connectionString: staging });
// Staging can lag production's schema; schema.sql is idempotent (CI applies it the same way).
await db.query(readFileSync(join(root, 'src/metadata/schema.sql'), 'utf8'));

const { processImage } = await import('../src/pipeline/process-image.ts');
const { deleteImage } = await import('../src/storage/cos.service.ts');

const count = Number(process.argv[2] ?? 10);
const dir = join(root, 'scripts/demo-images');
const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).slice(0, count);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const runs: { file: string; ingestMs: number; readyMs: number }[] = [];
const created: { incidentId: string; storagePath: string | null }[] = [];

for (const [i, file] of files.entries()) {
    // Trailing bytes after the JPEG end marker: viewers ignore them, but the content hash changes,
    // so the duplicate check doesn't return the copy already on the staging branch.
    const buffer = Buffer.concat([readFileSync(join(dir, file)), randomBytes(16)]);
    // ~5 km apart inside Victoria, so no two runs group into one incident.
    const latitude = -37.55 - i * 0.05;
    const longitude = 145.2 + i * 0.05;

    const t0 = performance.now();
    const record = await processImage(
        { sourceType: 'drone', latitude, longitude, timestamp: new Date().toISOString() },
        { buffer, mimetype: 'image/jpeg', originalname: file },
    );
    const ingestMs = performance.now() - t0;
    created.push({ incidentId: record.incidentId, storagePath: record.storagePath });
    if (record.uploadStatus !== 'stored') throw new Error(`${file}: upload ${record.uploadStatus} (${record.ingestionError})`);

    // Scored = the AI has written its result (assessed, or held for review with its readings).
    let readyMs = NaN;
    while (performance.now() - t0 < 60_000) {
        const { rows } = await db.query(
            `SELECT 1 FROM images WHERE image_id = $1 AND (assessment_status <> 'pending_review' OR smoke_density IS NOT NULL)`,
            [record.imageId],
        );
        if (rows.length) {
            readyMs = performance.now() - t0;
            break;
        }
        await sleep(100);
    }
    runs.push({ file, ingestMs, readyMs });
    console.log(`${file}: ingest ${Math.round(ingestMs)} ms, scored ${Math.round(readyMs)} ms`);
}

// Clean up: the uploaded objects and every staging row these incidents produced.
await sleep(3000); // let the background place-name lookup finish writing first
const ids = created.map((c) => c.incidentId);
for (const { storagePath } of created) if (storagePath) await deleteImage(storagePath);
for (const table of ['decisions', 'incident_dispatch', 'images']) {
    await db.query(`DELETE FROM ${table} WHERE incident_id = ANY($1)`, [ids]);
}
console.log(`cleaned up ${created.length} uploads and their staging rows`);

const stat = (xs: number[]) => {
    const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
    const q = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
    return { median: q(0.5), p90: q(0.9), max: Math.round(s[s.length - 1]), n: s.length };
};
console.log('ingest (validate + upload + record), ms:', stat(runs.map((r) => r.ingestMs)));
console.log('photo received to scored, ms:', stat(runs.map((r) => r.readyMs)));
console.log('+ up to 5 s until the coordinator map refreshes');
await db.end();
process.exit(0);
