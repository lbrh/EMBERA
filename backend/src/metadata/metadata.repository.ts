import '../utils/load-env.ts';
import { Pool, type PoolClient } from 'pg';
import { ValidationError } from '../pipeline/validate.ts';
import type {
    Assignment,
    AssignmentStatus,
    Comment,
    CrewType,
    CrewWithAssignment,
    SupportRequest,
    SupportRequestStatus,
    CoordinatorPatch,
    Decision,
    DispatchState,
    ImageMetadata,
    IncidentImage,
} from './metadata.types.ts';

// Schema applied via schema.sql against the DATABASE_URL project (currently the free
// Neon "capstone" project — see backend/.env.example). Swapping to IBM Cloud Databases
// for PostgreSQL later is just changing DATABASE_URL; this file doesn't change.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COLUMNS = {
    incidentId: 'incident_id',
    imageId: 'image_id',
    storagePath: 'storage_path',
    timestamp: 'timestamp',
    sourceType: 'source_type',
    latitude: 'latitude',
    longitude: 'longitude',
    severityScore: 'severity_score',
    severityScoreOverride: 'severity_score_override',
    overriddenBy: 'overridden_by',
    overriddenAt: 'overridden_at',
    confidenceScore: 'confidence_score',
    severityExplanation: 'severity_explanation',
    smokeDensity: 'smoke_density',
    flameVisibility: 'flame_visibility',
    vegetationImpact: 'vegetation_impact',
    infrastructureImpact: 'infrastructure_impact',
    assessmentStatus: 'assessment_status',
    classificationLabel: 'classification_label',
    classificationLabelOverride: 'classification_label_override',
    priorityRank: 'priority_rank',
    uploadStatus: 'upload_status',
    ingestionError: 'ingestion_error',
    contentHash: 'content_hash',
    placeName: 'place_name',
    weather: 'weather',
} as const satisfies Record<keyof ImageMetadata, string>;

function fromRow(row: Record<string, unknown>): ImageMetadata {
    const record: Record<string, unknown> = {};
    for (const [field, column] of Object.entries(COLUMNS)) {
        const value = row[column];
        record[field] = value instanceof Date ? value.toISOString() : value;
    }
    return record as unknown as ImageMetadata;
}

function fromIncidentRow(row: Record<string, unknown>): IncidentImage {
    const updatedAt = row.dispatch_updated_at;
    return {
        ...fromRow(row),
        dispatchState: (row.dispatch_state as DispatchState | null) ?? null,
        dispatchUpdatedBy: (row.dispatch_updated_by as string | null) ?? null,
        dispatchUpdatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : ((updatedAt as string | null) ?? null),
    };
}

// Image columns plus the incident's dispatch state, for every incident-facing read.
const INCIDENT_SELECT = `i.*, d.state AS dispatch_state, d.updated_by AS dispatch_updated_by, d.updated_at AS dispatch_updated_at
         FROM images i
         LEFT JOIN incident_dispatch d ON d.incident_id = i.incident_id`;

function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}

export async function create(record: ImageMetadata): Promise<ImageMetadata> {
    const fields = Object.keys(COLUMNS) as (keyof ImageMetadata)[];
    const columns = fields.map((field) => COLUMNS[field]);
    const placeholders = fields.map((_, i) => `$${i + 1}`);
    const values = fields.map((field) => record[field]);

    try {
        const { rows } = await pool.query(
            `INSERT INTO images (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
            values,
        );
        return fromRow(rows[0]);
    } catch (err) {
        // Two identical uploads landing at the same instant both pass the pre-insert
        // findByContentHash check; the UNIQUE constraint is the real guarantee.
        if (isUniqueViolation(err) && record.contentHash) {
            const existing = await findByContentHash(record.contentHash);
            if (existing) return existing;
        }
        throw err;
    }
}

export async function update(imageId: string, patch: Partial<ImageMetadata>): Promise<ImageMetadata> {
    const fields = Object.keys(patch) as (keyof ImageMetadata)[];
    if (fields.length === 0) {
        const existing = await get(imageId);
        if (!existing) throw new Error(`No metadata record for image ${imageId}`);
        return existing;
    }

    const setClauses = fields.map((field, i) => `${COLUMNS[field]} = $${i + 2}`);
    const values = fields.map((field) => patch[field]);

    const { rows } = await pool.query(
        `UPDATE images SET ${setClauses.join(', ')} WHERE image_id = $1 RETURNING *`,
        [imageId, ...values],
    );
    if (rows.length === 0) {
        throw new Error(`No metadata record for image ${imageId}`);
    }
    return fromRow(rows[0]);
}

export async function get(imageId: string): Promise<ImageMetadata | undefined> {
    const { rows } = await pool.query('SELECT * FROM images WHERE image_id = $1', [imageId]);
    return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function findByContentHash(hash: string): Promise<ImageMetadata | undefined> {
    const { rows } = await pool.query('SELECT * FROM images WHERE content_hash = $1 LIMIT 1', [hash]);
    return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function checkDatabaseConnection(): Promise<void> {
    await pool.query('SELECT 1');
}

const INCIDENT_GROUPING_LOCK_KEY = 727100;

// ponytail: one global advisory lock serializes the "find nearest incident or create
// one" decision across concurrent /ingest calls, closing the race where two near-
// simultaneous uploads in the same area/window each miss the other's uncommitted row
// and create two incidents instead of one. Global (not per-region) because traffic here
// is low enough that serializing this one step is unmeasurable; a per-bucket lock would
// only be worth the added complexity at much higher throughput.
export async function withIncidentGroupingLock<T>(fn: () => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [INCIDENT_GROUPING_LOCK_KEY]);
        const result = await fn();
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

// One row per incident (its most recent image) within a map viewport — per
// docs/live/architecture.md section 3, the Map Page reads coordinates,
// severity_score, and assessment_status for markers.
export async function findInBoundingBox(bounds: BoundingBox): Promise<IncidentImage[]> {
    const { rows } = await pool.query(
        `SELECT DISTINCT ON (i.incident_id) ${INCIDENT_SELECT}
         WHERE i.latitude BETWEEN $1 AND $2 AND i.longitude BETWEEN $3 AND $4
         ORDER BY i.incident_id, i."timestamp" DESC`,
        [bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon],
    );
    return rows.map(fromIncidentRow);
}

// All images for one incident — the Incident Page joins the full record plus
// storage_path and severity_explanation (V2 doc section 7).
export async function findByIncidentId(incidentId: string): Promise<IncidentImage[]> {
    const { rows } = await pool.query(
        `SELECT ${INCIDENT_SELECT} WHERE i.incident_id = $1 ORDER BY i."timestamp" DESC`,
        [incidentId],
    );
    return rows.map(fromIncidentRow);
}

// Dispatch order — the Order Page reads priority_rank (V2 doc section 7). Prioritisation
// logic itself doesn't exist yet (a separate, not-yet-built phase per the docs), so this
// is just the sort; priority_rank is null for every row until that logic is built.
export async function findOrderedByPriority(): Promise<IncidentImage[]> {
    const { rows } = await pool.query(
        `SELECT ${INCIDENT_SELECT} ORDER BY i.priority_rank ASC NULLS LAST, i."timestamp" DESC`,
    );
    return rows.map(fromIncidentRow);
}

export interface LatestIncidentImage {
    incidentId: string;
    latitude: number;
    longitude: number;
    timestamp: string;
}

// One row per incident: its most recent image, for the auto-grouping check in
// pipeline/group-incident.ts. Only open incidents: a fresh photo next to an extinguished fire or
// a dismissed false alarm starts a new incident, rather than landing hidden inside a closed one.
export async function findLatestImagePerIncident(): Promise<LatestIncidentImage[]> {
    const { rows } = await pool.query(
        `SELECT DISTINCT ON (i.incident_id) i.incident_id, i.latitude, i.longitude, i."timestamp"
         FROM images i
         LEFT JOIN incident_dispatch d ON d.incident_id = i.incident_id
         WHERE d.state IS NULL OR d.state NOT IN ('extinguished', 'archived')
         ORDER BY i.incident_id, i."timestamp" DESC`,
    );
    return rows.map((row) => ({
        incidentId: row.incident_id,
        latitude: row.latitude,
        longitude: row.longitude,
        timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
    }));
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function logDecision(
    client: PoolClient,
    entry: { incidentId: string; imageId: string | null; field: string; from: unknown; to: unknown; by: string },
): Promise<void> {
    await client.query(
        `INSERT INTO decisions (incident_id, image_id, field, from_value, to_value, decided_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [entry.incidentId, entry.imageId, entry.field, entry.from == null ? null : String(entry.from), entry.to == null ? null : String(entry.to), entry.by],
    );
}

// Applies a coordinator's decision to one image and logs every field that actually changed,
// atomically. Returns undefined if the image doesn't exist.
export async function applyCoordinatorDecision(
    imageId: string,
    patch: CoordinatorPatch,
    by: string,
): Promise<ImageMetadata | undefined> {
    return inTransaction(async (client) => {
        const { rows } = await client.query('SELECT * FROM images WHERE image_id = $1 FOR UPDATE', [imageId]);
        if (!rows[0]) return undefined;
        const current = fromRow(rows[0]);

        const changed = (Object.keys(patch) as (keyof CoordinatorPatch)[]).filter(
            (field) => patch[field] !== undefined && patch[field] !== current[field],
        );
        if (changed.length === 0) return current;

        const values = changed.map((field) => patch[field]);
        const setClauses = changed.map((field, i) => `${COLUMNS[field]} = $${i + 2}`);
        const n = changed.length;
        const updated = await client.query(
            `UPDATE images SET ${setClauses.join(', ')}, overridden_by = $${n + 2}, overridden_at = now()
             WHERE image_id = $1 RETURNING *`,
            [imageId, ...values, by],
        );
        for (const field of changed) {
            await logDecision(client, { incidentId: current.incidentId, imageId, field, from: current[field], to: patch[field], by });
        }
        return fromRow(updated.rows[0]);
    });
}

// Sets an incident's dispatch state and logs the change. Returns undefined if no image
// belongs to that incident.
export async function setDispatchState(
    incidentId: string,
    state: DispatchState,
    by: string,
): Promise<{ incidentId: string; dispatchState: DispatchState } | undefined> {
    return inTransaction(async (client) => {
        if (!(await incidentExists(client, incidentId))) return undefined;
        await applyDispatchState(client, incidentId, state, by);
        return { incidentId, dispatchState: state };
    });
}

async function incidentExists(client: PoolClient, incidentId: string): Promise<boolean> {
    const { rowCount } = await client.query('SELECT 1 FROM images WHERE incident_id = $1 LIMIT 1', [incidentId]);
    return (rowCount ?? 0) > 0;
}

// Every dispatch change goes through here. An incident that stops being live (cancelled,
// extinguished, archived) frees every crew still assigned to it, so no crew stays stuck.
async function applyDispatchState(client: PoolClient, incidentId: string, state: DispatchState, by: string): Promise<void> {
    const { rows } = await client.query('SELECT state FROM incident_dispatch WHERE incident_id = $1 FOR UPDATE', [incidentId]);
    const previous: DispatchState | null = rows[0]?.state ?? null;
    if (previous === state) return;
    await client.query(
        `INSERT INTO incident_dispatch (incident_id, state, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (incident_id) DO UPDATE SET state = $2, updated_by = $3, updated_at = now()`,
        [incidentId, state, by],
    );
    await logDecision(client, { incidentId, imageId: null, field: 'dispatchState', from: previous, to: state, by });
    if (state === 'live') return;
    const cleared = await client.query(
        `WITH open AS (
             SELECT a.assignment_id, a.status, c.label FROM assignments a JOIN crews c USING (crew_id)
             WHERE a.incident_id = $1 AND a.status <> 'cleared' FOR UPDATE OF a
         )
         UPDATE assignments SET status = 'cleared', updated_at = now() FROM open
         WHERE assignments.assignment_id = open.assignment_id
         RETURNING open.label, open.status AS previous`,
        [incidentId],
    );
    for (const row of cleared.rows) {
        await logDecision(client, { incidentId, imageId: null, field: `crew:${row.label}`, from: row.previous, to: 'cleared', by });
    }
    await client.query(`UPDATE support_requests SET status = 'dismissed' WHERE incident_id = $1 AND status = 'open'`, [incidentId]);
}

export async function findDecisions(incidentId: string): Promise<Decision[]> {
    const { rows } = await pool.query(
        'SELECT * FROM decisions WHERE incident_id = $1 ORDER BY decided_at DESC, id DESC',
        [incidentId],
    );
    return rows.map((row) => ({
        id: Number(row.id),
        incidentId: row.incident_id,
        imageId: row.image_id,
        field: row.field,
        fromValue: row.from_value,
        toValue: row.to_value,
        decidedBy: row.decided_by,
        decidedAt: row.decided_at instanceof Date ? row.decided_at.toISOString() : row.decided_at,
    }));
}

function fromCommentRow(row: Record<string, unknown>): Comment {
    const createdAt = row.created_at;
    return {
        id: Number(row.id),
        incidentId: row.incident_id as string,
        author: row.author as string,
        body: row.body as string,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : (createdAt as string),
    };
}

// Adds a comment to an incident. Returns undefined if no image belongs to that incident.
export async function addComment(incidentId: string, author: string, body: string): Promise<Comment | undefined> {
    const { rows } = await pool.query(
        `INSERT INTO comments (incident_id, author, body)
         SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM images WHERE incident_id = $1)
         RETURNING *`,
        [incidentId, author, body],
    );
    return rows[0] ? fromCommentRow(rows[0]) : undefined;
}

export async function findComments(incidentId: string): Promise<Comment[]> {
    const { rows } = await pool.query(
        'SELECT * FROM comments WHERE incident_id = $1 ORDER BY created_at DESC, id DESC',
        [incidentId],
    );
    return rows.map(fromCommentRow);
}

// A request that clashes with the current state, e.g. a crew that's already on another incident.
export class ConflictError extends Error {}

const NEXT_STATUS: Record<AssignmentStatus, AssignmentStatus[]> = {
    dispatched: ['en_route', 'cleared'],
    en_route: ['on_scene', 'cleared'],
    on_scene: ['cleared'],
    cleared: [],
};

export function canMoveAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
    return NEXT_STATUS[from].includes(to);
}

function toIso(value: unknown): string {
    return value instanceof Date ? value.toISOString() : (value as string);
}

function fromAssignmentRow(row: Record<string, unknown>): Assignment {
    return {
        assignmentId: Number(row.assignment_id),
        incidentId: row.incident_id as string,
        crewId: row.crew_id as string,
        status: row.status as AssignmentStatus,
        updatedAt: toIso(row.updated_at),
    };
}

// Every crew with its station and open assignment (null = available), by label.
export async function findCrews(): Promise<CrewWithAssignment[]> {
    const { rows } = await pool.query(
        `SELECT c.crew_id, c.label, c.crew_type, s.station_id, s.name AS station_name, s.latitude, s.longitude,
                a.assignment_id, a.incident_id, a.status, a.updated_at
         FROM crews c
         JOIN stations s USING (station_id)
         LEFT JOIN assignments a ON a.crew_id = c.crew_id AND a.status <> 'cleared'
         ORDER BY c.label`,
    );
    return rows.map((row) => ({
        crewId: row.crew_id,
        label: row.label,
        crewType: row.crew_type,
        station: { stationId: row.station_id, name: row.station_name, latitude: row.latitude, longitude: row.longitude },
        assignment: row.assignment_id == null ? null : fromAssignmentRow(row),
    }));
}

// Sends crews to an incident and makes it live, all or nothing. Returns undefined for an unknown
// incident; throws ConflictError if a crew is already out and ValidationError for an unknown crew.
export async function assignCrews(incidentId: string, crewIds: string[], by: string): Promise<Assignment[] | undefined> {
    return inTransaction(async (client) => {
        if (!(await incidentExists(client, incidentId))) return undefined;
        const crews = await client.query('SELECT crew_id, label FROM crews WHERE crew_id = ANY($1::uuid[])', [crewIds]);
        if (crews.rowCount !== crewIds.length) throw new ValidationError('unknown crew id');
        const labels = new Map<string, string>(crews.rows.map((row) => [row.crew_id, row.label]));

        const assignments: Assignment[] = [];
        for (const crewId of crewIds) {
            try {
                const { rows } = await client.query(
                    `INSERT INTO assignments (incident_id, crew_id, status) VALUES ($1, $2, 'dispatched') RETURNING *`,
                    [incidentId, crewId],
                );
                assignments.push(fromAssignmentRow(rows[0]));
            } catch (err) {
                if ((err as { code?: string }).code === '23505') {
                    throw new ConflictError(`${labels.get(crewId)} is already assigned to another incident`);
                }
                throw err;
            }
            await logDecision(client, { incidentId, imageId: null, field: `crew:${labels.get(crewId)}`, from: null, to: 'dispatched', by });
        }
        await applyDispatchState(client, incidentId, 'live', by);
        // another crew is on its way: that answers any open request for help
        await client.query(`UPDATE support_requests SET status = 'fulfilled' WHERE incident_id = $1 AND status = 'open'`, [incidentId]);
        return assignments;
    });
}

// Moves an assignment along (en route, on scene) or clears it (recall). Recalling the last crew
// on a live incident puts it back in the dispatch order. Returns undefined for an unknown id.
export async function setAssignmentStatus(assignmentId: number, status: AssignmentStatus, by: string): Promise<Assignment | undefined> {
    return inTransaction(async (client) => {
        const { rows } = await client.query(
            `SELECT a.*, c.label FROM assignments a JOIN crews c USING (crew_id) WHERE a.assignment_id = $1 FOR UPDATE OF a`,
            [assignmentId],
        );
        if (!rows[0]) return undefined;
        const current = fromAssignmentRow(rows[0]);
        if (current.status === status) return current;
        if (!canMoveAssignment(current.status, status)) {
            throw new ConflictError(`${rows[0].label} can't go from ${current.status} to ${status}`);
        }
        const updated = await client.query(
            `UPDATE assignments SET status = $2, updated_at = now() WHERE assignment_id = $1 RETURNING *`,
            [assignmentId, status],
        );
        await logDecision(client, { incidentId: current.incidentId, imageId: null, field: `crew:${rows[0].label}`, from: current.status, to: status, by });

        if (status === 'cleared') {
            const open = await client.query(`SELECT 1 FROM assignments WHERE incident_id = $1 AND status <> 'cleared' LIMIT 1`, [current.incidentId]);
            const dispatch = await client.query('SELECT state FROM incident_dispatch WHERE incident_id = $1', [current.incidentId]);
            if (open.rowCount === 0 && dispatch.rows[0]?.state === 'live') {
                await applyDispatchState(client, current.incidentId, 'awaiting', by);
            }
        }
        return fromAssignmentRow(updated.rows[0]);
    });
}

const SUPPORT_SELECT = `SELECT r.*, c.label AS crew_label FROM support_requests r JOIN crews c USING (crew_id)`;

function fromSupportRow(row: Record<string, unknown>): SupportRequest {
    return {
        id: Number(row.id),
        incidentId: row.incident_id as string,
        crewId: row.crew_id as string,
        crewLabel: row.crew_label as string,
        crewType: (row.crew_type as CrewType | null) ?? null,
        note: (row.note as string | null) ?? null,
        status: row.status as SupportRequestStatus,
        createdAt: toIso(row.created_at),
    };
}

// A crew asks for more help at its incident. Only a crew assigned there may ask; returns
// undefined for an unknown incident, throws ConflictError for a crew that isn't on it.
export async function createSupportRequest(
    incidentId: string,
    crewId: string,
    crewType: CrewType | null,
    note: string | null,
    by: string,
): Promise<SupportRequest | undefined> {
    return inTransaction(async (client) => {
        if (!(await incidentExists(client, incidentId))) return undefined;
        const onScene = await client.query(
            `SELECT 1 FROM assignments WHERE incident_id = $1 AND crew_id = $2 AND status <> 'cleared'`,
            [incidentId, crewId],
        );
        if (onScene.rowCount === 0) throw new ConflictError('only a crew assigned to this incident can request support');
        const { rows } = await client.query(
            `WITH r AS (INSERT INTO support_requests (incident_id, crew_id, crew_type, note) VALUES ($1, $2, $3, $4) RETURNING *)
             SELECT r.*, c.label AS crew_label FROM r JOIN crews c USING (crew_id)`,
            [incidentId, crewId, crewType, note],
        );
        await logDecision(client, { incidentId, imageId: null, field: 'supportRequest', from: null, to: crewType ?? 'any crew', by });
        return fromSupportRow(rows[0]);
    });
}

export async function findOpenSupportRequests(): Promise<SupportRequest[]> {
    const { rows } = await pool.query(`${SUPPORT_SELECT} WHERE r.status = 'open' ORDER BY r.created_at DESC, r.id DESC`);
    return rows.map(fromSupportRow);
}

// The coordinator dismisses a request (or marks it fulfilled by hand). Returns undefined for an unknown id.
export async function setSupportRequestStatus(id: number, status: Exclude<SupportRequestStatus, 'open'>, by: string): Promise<SupportRequest | undefined> {
    return inTransaction(async (client) => {
        const { rows } = await client.query(`${SUPPORT_SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
        if (!rows[0]) return undefined;
        const current = fromSupportRow(rows[0]);
        if (current.status === status) return current;
        if (current.status !== 'open') throw new ConflictError(`this request is already ${current.status}`);
        await client.query('UPDATE support_requests SET status = $2 WHERE id = $1', [id, status]);
        await logDecision(client, { incidentId: current.incidentId, imageId: null, field: 'supportRequest', from: 'open', to: status, by });
        return { ...current, status };
    });
}
