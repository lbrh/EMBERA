// Resets the database and image bucket to one fixed demo scenario, identical on every run:
// active incidents on Thursday 1 October 2026 (dispatch order, live crews, manual review queue,
// a coordinator override and a multi-image incident), plus resolved and archived ones from the
// days before. Everything already in the `images`, `incident_dispatch` and `decisions` tables is
// deleted, as are the incident images in the bucket. Other bucket objects (the training
// dataset) are left alone. schema.sql is applied first (it's re-runnable), so a database that
// predates a migration still takes the data.
//
//   npm run seed:demo            shows what it would delete and add, changes nothing
//   npm run seed:demo -- --yes   does it
//
// AI readings come from the labelled manifest the indicator models were trained on and are
// scored with the real rubric (assessSeverity), so the numbers are the ones the pipeline would
// produce; watsonx isn't called, which keeps every run the same. IDs are derived from each
// scenario's name, so incident URLs don't change between runs either.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { v5 as uuidv5 } from 'uuid';
import '../src/utils/load-env.ts';
import { buildObjectKey, deleteImage, listObjectKeys, uploadImage } from '../src/storage/cos.service.ts';
import { assessSeverity, classifyFromIndicators, type IndicatorReadings } from '../src/pipeline/assess-severity.ts';
import { forestFireDangerIndex } from '../src/pipeline/fire-weather.ts';
import type { DispatchState, FireWeather, SourceType } from '../src/metadata/metadata.types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(HERE, 'demo-images');
const SCHEMA = readFileSync(join(HERE, '../src/metadata/schema.sql'), 'utf8');
const ID_NAMESPACE = '6f1c1b1e-4a0e-4f38-9a52-0d1e6c7a9b21';
const COORDINATOR = 'EC · Emergency Coordinator'; // same name the frontend sends as `by`
// Only keys shaped like buildObjectKey() output are ours to delete.
const IMAGE_KEY = /^\/[0-9a-f-]{36}\/(drone|cctv|citizen|satellite)\//;

interface Shot {
    file: string;
    source: SourceType;
    at: string; // local Victorian time, AEST (+10:00)
    readings: IndicatorReadings; // from the training manifest
    confidence: number; // lowest of the four indicator confidences; <= 0.75 routes to manual review
}

interface Scenario {
    name: string;
    place: string; // what Nominatim returns for lat/lon (see src/pipeline/place-name.ts), fixed here so runs match
    lat: number;
    lon: number;
    shots: Shot[]; // coordinator actions below apply to the newest shot, as in the UI
    override?: { level: 1 | 2 | 3 | 4; at: string };
    confirm?: string; // coordinator confirmed the AI's tag from manual review
    discard?: string; // coordinator discarded it as not a fire (-> Archive)
    dispatch?: [DispatchState, string][];
    weather?: Conditions[]; // now, +1 h, +2 h; defaults to DEMO_DAY
}

// Fixed instead of looked up (src/pipeline/fire-weather.ts), so runs match: a Very high
// north-westerly day with a south-westerly change coming through, which bends the spread
// envelopes east; hotter, drier and steady out west, where fire danger reaches Extreme.
type Conditions = { temperatureC: number; humidityPct: number; windKmh: number; windFromDeg: number };
const DEMO_DAY: Conditions[] = [
    { temperatureC: 30, humidityPct: 20, windKmh: 35, windFromDeg: 315 },
    { temperatureC: 28, humidityPct: 25, windKmh: 40, windFromDeg: 270 },
    { temperatureC: 22, humidityPct: 40, windKmh: 30, windFromDeg: 225 },
];
const HOT_WEST: Conditions[] = Array(3).fill({ temperatureC: 36, humidityPct: 10, windKmh: 45, windFromDeg: 300 });
const withFfdi = (c: Conditions) => ({ ...c, ffdi: forestFireDangerIndex(c.temperatureC, c.humidityPct, c.windKmh) });
const plusHours = (iso: string, hours: number) => new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();

const r = (
    smokeDensity: IndicatorReadings['smokeDensity'],
    flameVisibility: IndicatorReadings['flameVisibility'],
    vegetationImpact: IndicatorReadings['vegetationImpact'],
    infrastructureImpact: IndicatorReadings['infrastructureImpact'],
): IndicatorReadings => ({ smokeDensity, flameVisibility, vegetationImpact, infrastructureImpact });

const OCT1 = '2026-10-01';

const SCENARIOS: Scenario[] = [
    // ---- Active, Thursday 1 October ----
    {
        name: 'kinglake', place: 'Kinglake', lat: -37.52, lon: 145.35, // three sources, one incident
        shots: [
            { file: 'flamevision_024688.png', source: 'drone', at: `${OCT1}T07:48`, confidence: 0.88, readings: r('dense_dark', 'visible_high_flames_and_embers', 'dense_vegetation', 'no_infrastructure') },
            { file: 'dfire_016578.jpg', source: 'citizen', at: `${OCT1}T08:05`, confidence: 0.86, readings: r('very_dense_blocking_vision', 'visible_high_flames_and_embers', 'dense_vegetation', 'moderate_infrastructure') },
            { file: 'dfire_010659.jpg', source: 'cctv', at: `${OCT1}T08:21`, confidence: 0.91, readings: r('very_dense_blocking_vision', 'large_flame_wall_embers_everywhere', 'dense_vegetation', 'moderate_infrastructure') },
        ],
    },
    {
        name: 'dandenong-ranges', place: 'Olinda', lat: -37.857, lon: 145.366,
        shots: [{ file: 'dfire_015452.jpg', source: 'cctv', at: `${OCT1}T06:52`, confidence: 0.93, readings: r('very_dense_blocking_vision', 'large_flame_wall_embers_everywhere', 'dense_vegetation', 'sparse_infrastructure') }],
        dispatch: [['live', `${OCT1}T07:10`]],
    },
    {
        name: 'grampians', place: 'Halls Gap', lat: -37.137, lon: 142.519, weather: HOT_WEST,
        shots: [{ file: 'flamevision_030889.jpg', source: 'drone', at: `${OCT1}T09:14`, confidence: 0.88, readings: r('dense_dark', 'visible_high_flames_and_embers', 'dense_vegetation', 'moderate_infrastructure') }],
    },
    {
        name: 'macedon-ranges', place: 'Mount Macedon', lat: -37.398, lon: 144.585,
        shots: [{ file: 'dfire_019817.jpg', source: 'citizen', at: `${OCT1}T10:02`, confidence: 0.84, readings: r('dense_dark', 'visible_high_flames_and_embers', 'dense_vegetation', 'no_infrastructure') }],
        dispatch: [['live', `${OCT1}T10:20`]],
    },
    {
        name: 'otway-ranges', place: 'Lavers Hill', lat: -38.68, lon: 143.39, // AI said High; coordinator raised it
        shots: [{ file: 'flamevision_032080.jpg', source: 'drone', at: `${OCT1}T11:36`, confidence: 0.81, readings: r('dense_dark', 'visible_high_flames_and_embers', 'sparse_vegetation', 'sparse_infrastructure') }],
        override: { level: 3, at: `${OCT1}T11:50` },
    },
    {
        name: 'mount-buller', place: 'Mt Buller Village', lat: -37.146, lon: 146.438, // low confidence, confirmed from review
        shots: [{ file: 'flamevision_034016.jpg', source: 'drone', at: `${OCT1}T10:41`, confidence: 0.72, readings: r('dense_dark', 'visible_high_flames_and_embers', 'dense_vegetation', 'no_infrastructure') }],
        confirm: `${OCT1}T11:05`,
    },
    {
        name: 'bright', place: 'Bright', lat: -36.728, lon: 146.962,
        shots: [{ file: 'flamevision_025921.png', source: 'drone', at: `${OCT1}T12:18`, confidence: 0.89, readings: r('dense_dark', 'some_flame', 'moderate_vegetation', 'sparse_infrastructure') }],
    },
    {
        name: 'lake-eildon', place: 'Eildon', lat: -37.232, lon: 145.915,
        shots: [{ file: 'dfire_004176.jpg', source: 'cctv', at: `${OCT1}T08:40`, confidence: 0.87, readings: r('very_dense_blocking_vision', 'no_visible_flame', 'dense_vegetation', 'no_infrastructure') }],
    },
    {
        name: 'whipstick', place: 'Whipstick', lat: -36.635, lon: 144.27,
        shots: [{ file: 'dfire_003771.jpg', source: 'citizen', at: `${OCT1}T13:05`, confidence: 0.83, readings: r('moderate', 'some_flame', 'dense_vegetation', 'sparse_infrastructure') }],
    },
    {
        name: 'arthurs-seat', place: 'Arthurs Seat', lat: -38.357, lon: 144.952,
        shots: [{ file: 'dfire_017092.jpg', source: 'citizen', at: `${OCT1}T14:22`, confidence: 0.9, readings: r('moderate', 'no_visible_flame', 'sparse_vegetation', 'no_infrastructure') }],
    },
    {
        name: 'wyperfeld', place: 'Yaapeet', lat: -35.6, lon: 142.0, weather: HOT_WEST,
        shots: [{ file: 'dfire_015857.jpg', source: 'citizen', at: `${OCT1}T12:47`, confidence: 0.85, readings: r('moderate', 'no_visible_flame', 'sparse_vegetation', 'sparse_infrastructure') }],
    },
    // ---- Manual review queue (confidence at or below 0.75), 1 October ----
    {
        name: 'warburton', place: 'Warburton', lat: -37.754, lon: 145.69,
        shots: [{ file: 'dfire_007664.jpg', source: 'cctv', at: `${OCT1}T05:40`, confidence: 0.58, readings: r('none_or_haze', 'some_flame', 'no_vegetation', 'sparse_infrastructure') }],
    },
    {
        name: 'walhalla', place: 'Walhalla', lat: -37.941, lon: 146.45,
        shots: [{ file: 'dfire_004132.jpg', source: 'citizen', at: `${OCT1}T14:48`, confidence: 0.71, readings: r('very_dense_blocking_vision', 'no_visible_flame', 'dense_vegetation', 'sparse_infrastructure') }],
    },
    {
        name: 'healesville', place: 'Healesville', lat: -37.654, lon: 145.517,
        shots: [{ file: 'flamevision_024757.png', source: 'drone', at: `${OCT1}T15:10`, confidence: 0.66, readings: r('dense_dark', 'visible_high_flames_and_embers', 'sparse_vegetation', 'no_infrastructure') }],
    },
    {
        name: 'lake-mountain', place: 'Marysville', lat: -37.49, lon: 145.88,
        shots: [{ file: 'dfire_017525.jpg', source: 'citizen', at: `${OCT1}T15:32`, confidence: 0.69, readings: r('very_dense_blocking_vision', 'no_visible_flame', 'dense_vegetation', 'sparse_infrastructure') }],
    },
    // ---- Resolved (extinguished), before 1 October ----
    {
        name: 'anglesea', place: 'Anglesea', lat: -38.405, lon: 144.185,
        shots: [{ file: 'dfire_014945.jpg', source: 'cctv', at: '2026-09-28T16:20', confidence: 0.9, readings: r('very_dense_blocking_vision', 'large_flame_wall_embers_everywhere', 'dense_vegetation', 'no_infrastructure') }],
        dispatch: [['live', '2026-09-28T16:35'], ['extinguished', '2026-09-29T09:10']],
    },
    {
        name: 'beechworth', place: 'Beechworth', lat: -36.358, lon: 146.687,
        shots: [{ file: 'dfire_017755.jpg', source: 'citizen', at: '2026-09-29T11:45', confidence: 0.86, readings: r('dense_dark', 'visible_high_flames_and_embers', 'sparse_vegetation', 'sparse_infrastructure') }],
        dispatch: [['live', '2026-09-29T12:00'], ['extinguished', '2026-09-29T15:30']],
    },
    {
        name: 'daylesford', place: 'Daylesford', lat: -37.341, lon: 144.142,
        shots: [{ file: 'dfire_003553.jpg', source: 'citizen', at: '2026-09-30T10:15', confidence: 0.88, readings: r('moderate', 'some_flame', 'moderate_vegetation', 'sparse_infrastructure') }],
        dispatch: [['live', '2026-09-30T10:25'], ['extinguished', '2026-09-30T13:40']],
    },
    // ---- Archive: an extinguished fire filed away, and images discarded as not a fire ----
    {
        name: 'lorne', place: 'Lorne', lat: -38.54, lon: 143.97,
        shots: [{ file: 'flamevision_023011.png', source: 'drone', at: '2026-09-25T13:20', confidence: 0.87, readings: r('moderate', 'some_flame', 'moderate_vegetation', 'moderate_infrastructure') }],
        dispatch: [['live', '2026-09-25T13:35'], ['extinguished', '2026-09-25T18:10'], ['archived', '2026-09-27T09:00']],
    },
    {
        name: 'ararat', place: 'Ararat', lat: -37.284, lon: 142.927, // storm cloud read as smoke
        shots: [{ file: 'dfire_012144.jpg', source: 'cctv', at: '2026-09-26T17:05', confidence: 0.61, readings: r('dense_dark', 'no_visible_flame', 'no_vegetation', 'sparse_infrastructure') }],
        discard: '2026-09-26T17:20',
    },
    {
        name: 'mansfield', place: 'Mansfield', lat: -37.052, lon: 146.083, // lightning
        shots: [{ file: 'dfire_002426.jpg', source: 'cctv', at: '2026-09-27T19:40', confidence: 0.55, readings: r('none_or_haze', 'no_visible_flame', 'no_vegetation', 'sparse_infrastructure') }],
        discard: '2026-09-27T19:52',
    },
    {
        name: 'orbost', place: 'Orbost', lat: -37.702, lon: 148.457, // sunlight and haze through a window
        shots: [{ file: 'dfire_010558.jpg', source: 'citizen', at: '2026-09-29T07:30', confidence: 0.64, readings: r('dense_dark', 'no_visible_flame', 'no_vegetation', 'sparse_infrastructure') }],
        discard: '2026-09-29T07:41',
    },
];

/** Local AEST wall time -> ISO UTC, the form the ingest pipeline stores. */
const iso = (local: string) => new Date(`${local}:00+10:00`).toISOString();
const id = (...parts: string[]) => uuidv5(parts.join(':'), ID_NAMESPACE);
const clamp = (n: number) => Math.min(0.99, Math.round(n * 100) / 100);

interface Row {
    [column: string]: unknown;
}
interface Decision {
    incident_id: string;
    image_id: string | null;
    field: string;
    from_value: string | null;
    to_value: string | null;
    decided_at: string;
}

function build() {
    const images: (Row & { file: string; bytes: Buffer; storage_path: string })[] = [];
    const dispatch: Row[] = [];
    const decisions: Decision[] = [];

    for (const s of SCENARIOS) {
        const incidentId = id('incident', s.name);
        const shots = [...s.shots].sort((a, b) => a.at.localeCompare(b.at));
        const rows = shots.map((shot, n) => {
            const imageId = id('image', s.name, String(n));
            const timestamp = iso(shot.at);
            const bytes = readFileSync(join(IMAGES_DIR, shot.file));
            const c = shot.confidence; // smoke and flame both at c, so the score (their mean) is c
            const [now, ...next] = s.weather ?? DEMO_DAY;
            const weather: FireWeather = {
                observedAt: timestamp,
                ...withFfdi(now),
                nextHours: next.map((c, h) => ({ time: plusHours(timestamp, h + 1), ...withFfdi(c) })),
            };
            const assessed = assessSeverity({
                weather,
                classificationLabel: classifyFromIndicators(shot.readings), // same as the live pipeline
                indicators: shot.readings,
                confidences: { flameVisibility: c, smokeDensity: c, infrastructureImpact: clamp(c + 0.09), vegetationImpact: clamp(c + 0.12) },
            });
            const ext = extname(shot.file).slice(1);
            return {
                file: shot.file,
                bytes,
                image_id: imageId,
                incident_id: incidentId,
                storage_path: buildObjectKey(incidentId, shot.source, timestamp, imageId, ext),
                timestamp,
                source_type: shot.source,
                latitude: s.lat,
                longitude: s.lon,
                severity_score: assessed.severityScore,
                severity_score_override: null as number | null,
                overridden_by: null as string | null,
                overridden_at: null as string | null,
                confidence_score: assessed.confidenceScore,
                severity_explanation: assessed.severityExplanation,
                smoke_density: assessed.smokeDensity,
                flame_visibility: assessed.flameVisibility,
                vegetation_impact: assessed.vegetationImpact,
                infrastructure_impact: assessed.infrastructureImpact,
                assessment_status: assessed.assessmentStatus as string,
                classification_label: assessed.classificationLabel,
                classification_label_override: null as string | null,
                priority_rank: null,
                upload_status: 'stored',
                ingestion_error: null,
                content_hash: createHash('md5').update(bytes).digest('hex'),
                place_name: s.place,
                weather,
            };
        });

        // Coordinator decisions land on the newest image, logged the way applyCoordinatorDecision does.
        const latest = rows[rows.length - 1];
        const decide = (at: string, patch: Partial<typeof latest>) => {
            for (const [field, to] of Object.entries(patch)) {
                const from = latest[field as keyof typeof latest];
                if (from === to) continue;
                decisions.push({
                    incident_id: incidentId,
                    image_id: latest.image_id,
                    field: field.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase()), // API field name, e.g. severityScoreOverride
                    from_value: from == null ? null : String(from),
                    to_value: to == null ? null : String(to),
                    decided_at: iso(at),
                });
            }
            Object.assign(latest, patch, { overridden_by: COORDINATOR, overridden_at: iso(at) });
        };
        if (s.override) decide(s.override.at, { severity_score_override: s.override.level });
        if (s.confirm) {
            decide(s.confirm, { severity_score_override: latest.severity_score, classification_label_override: 'fire', assessment_status: 'assessed' });
        }
        if (s.discard) decide(s.discard, { classification_label_override: 'non_fire', assessment_status: 'assessed' });

        let previous: DispatchState | null = null;
        for (const [state, at] of s.dispatch ?? []) {
            decisions.push({ incident_id: incidentId, image_id: null, field: 'dispatchState', from_value: previous, to_value: state, decided_at: iso(at) });
            previous = state;
        }
        if (s.dispatch?.length) {
            const [state, at] = s.dispatch[s.dispatch.length - 1];
            dispatch.push({ incident_id: incidentId, state, updated_by: COORDINATOR, updated_at: iso(at) });
        }
        images.push(...rows);
    }
    return { images, dispatch, decisions };
}

async function insert(db: pg.PoolClient, table: string, rows: Row[]) {
    for (const row of rows) {
        const columns = Object.keys(row);
        await db.query(
            `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
            Object.values(row),
        );
    }
}

const { images, dispatch, decisions } = build();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const count = async (table: string) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
const existingKeys = (await listObjectKeys()).filter((key) => IMAGE_KEY.test(key));

console.log(`Database  ${new URL(process.env.DATABASE_URL!).host}`);
console.log(`Bucket    ${process.env.COS_BUCKET}`);
console.log(
    `Deletes   ${await count('images')} images, ${await count('incident_dispatch')} dispatch states, ` +
        `${await count('decisions')} decisions, ${existingKeys.length} stored image files`,
);
console.log(`Adds      ${SCENARIOS.length} incidents, ${images.length} images, ${dispatch.length} dispatch states, ${decisions.length} decisions`);
console.table(
    SCENARIOS.map((s) => {
        const rows = images.filter((img) => img.incident_id === id('incident', s.name));
        const latest = rows.reduce((a, b) => (String(a.timestamp) > String(b.timestamp) ? a : b));
        return {
            incident: s.name,
            place: s.place,
            when: s.shots.map((shot) => shot.at).sort().at(-1)!.replace('T', ' '),
            images: rows.length,
            ai: latest.severity_score,
            override: latest.severity_score_override ?? '',
            conf: latest.confidence_score,
            status: latest.assessment_status,
            label: latest.classification_label_override ?? '',
            dispatch: s.dispatch?.at(-1)?.[0] ?? '',
        };
    }),
);

if (!process.argv.includes('--yes')) {
    console.log('\nNothing changed. Run again with --yes to reset to the demo data.');
    await pool.end();
    process.exit(0);
}

// Upload first and delete stale files last, so the site never points at a missing image and a
// failure part-way leaves the old data in place (the table swap is one transaction).
console.log('\nUploading images…');
await Promise.all(images.map((img) => uploadImage(img.storage_path, img.bytes, img.file.endsWith('.png') ? 'image/png' : 'image/jpeg')));

console.log('Replacing database rows…');
const db = await pool.connect();
try {
    await db.query('BEGIN');
    await db.query(SCHEMA);
    await db.query('TRUNCATE images, incident_dispatch, decisions RESTART IDENTITY');
    await insert(db, 'images', images.map(({ file: _file, bytes: _bytes, ...row }) => row));
    await insert(db, 'incident_dispatch', dispatch);
    // oldest first, so ids (the tie-break in findDecisions) follow the order things happened
    await insert(db, 'decisions', [...decisions].sort((a, b) => a.decided_at.localeCompare(b.decided_at)).map((d) => ({ ...d, decided_by: COORDINATOR })));
    await db.query('COMMIT');
} catch (err) {
    await db.query('ROLLBACK');
    throw err;
} finally {
    db.release();
}

const keep = new Set(images.map((img) => img.storage_path));
const stale = existingKeys.filter((key) => !keep.has(key));
console.log(`Deleting ${stale.length} old image files…`);
await Promise.all(stale.map(deleteImage));

await pool.end();
console.log('Done.');
