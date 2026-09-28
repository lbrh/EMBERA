-- Metadata schema, documented in docs/live/metadata-schema.md. One row per image/video object.
-- Final rubric: smoke, flame, amount of vegetation (fuel load) and amount of infrastructure nearby
-- (priority: fires near towns outrank fires in the middle of nowhere), people proximity dropped.

CREATE TABLE IF NOT EXISTS images (
    image_id UUID PRIMARY KEY,
    incident_id UUID NOT NULL,
    storage_path TEXT,
    "timestamp" TIMESTAMPTZ NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('drone', 'cctv', 'citizen', 'satellite')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,

    severity_score INTEGER,
    severity_score_override INTEGER,
    overridden_by TEXT,
    overridden_at TIMESTAMPTZ,
    confidence_score DOUBLE PRECISION,
    severity_explanation TEXT,

    smoke_density TEXT CHECK (smoke_density IN ('none_or_haze', 'moderate', 'dense_dark', 'very_dense_blocking_vision')),
    flame_visibility TEXT CHECK (flame_visibility IN ('no_visible_flame', 'some_flame', 'visible_high_flames_and_embers', 'large_flame_wall_embers_everywhere')),
    vegetation_impact TEXT CHECK (vegetation_impact IN ('no_vegetation', 'sparse_vegetation', 'moderate_vegetation', 'dense_vegetation')),
    infrastructure_impact TEXT CHECK (infrastructure_impact IN ('no_infrastructure', 'sparse_infrastructure', 'moderate_infrastructure', 'dense_infrastructure')),

    assessment_status TEXT NOT NULL CHECK (assessment_status IN ('assessed', 'unable_to_assess', 'pending_review')),
    classification_label TEXT CHECK (classification_label IN ('fire', 'non_fire', 'extinguished', 'uncertain')),
    priority_rank INTEGER,
    upload_status TEXT NOT NULL CHECK (upload_status IN ('pending', 'stored', 'failed')),
    ingestion_error TEXT,
    content_hash TEXT UNIQUE
);

-- Map viewport range queries and per-incident prefix fetches (V2 doc section 4/7).
CREATE INDEX IF NOT EXISTS images_incident_id_idx ON images (incident_id);
CREATE INDEX IF NOT EXISTS images_lat_lon_idx ON images (latitude, longitude);
CREATE INDEX IF NOT EXISTS images_priority_rank_idx ON images (priority_rank);

-- Migrate databases created before the final rubric: people proximity replaced by
-- infrastructure_impact, vegetation_impact redefined as amount of vegetation. Re-runnable.
-- Old vegetation values measured damage, not amount, so they can't be mapped and are cleared.
ALTER TABLE images DROP COLUMN IF EXISTS structure_people_proximity;
ALTER TABLE images ADD COLUMN IF NOT EXISTS infrastructure_impact TEXT;
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_infrastructure_impact_check;
UPDATE images SET infrastructure_impact = NULL WHERE infrastructure_impact NOT IN ('no_infrastructure', 'sparse_infrastructure', 'moderate_infrastructure', 'dense_infrastructure');
ALTER TABLE images ADD CONSTRAINT images_infrastructure_impact_check CHECK (infrastructure_impact IN ('no_infrastructure', 'sparse_infrastructure', 'moderate_infrastructure', 'dense_infrastructure'));
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_vegetation_impact_check;
UPDATE images SET vegetation_impact = NULL WHERE vegetation_impact NOT IN ('no_vegetation', 'sparse_vegetation', 'moderate_vegetation', 'dense_vegetation');
ALTER TABLE images ADD CONSTRAINT images_vegetation_impact_check CHECK (vegetation_impact IN ('no_vegetation', 'sparse_vegetation', 'moderate_vegetation', 'dense_vegetation'));

-- Coordinator decisions (Sprint 2 §5, US13/FR14). The AI's own columns are never overwritten:
-- a coordinator's call lives in the *_override columns (same pattern as severity_score_override),
-- and every change is written to `decisions` with its before/after value, who and when.
ALTER TABLE images ADD COLUMN IF NOT EXISTS classification_label_override TEXT;
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_classification_label_override_check;
ALTER TABLE images ADD CONSTRAINT images_classification_label_override_check CHECK (classification_label_override IN ('fire', 'non_fire', 'extinguished', 'uncertain'));

-- Human place name for the image's coordinates (reverse geocoded after ingest). Re-runnable.
ALTER TABLE images ADD COLUMN IF NOT EXISTS place_name TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS weather JSONB;
-- When the row was written (the "timestamp" column is capture time, from EXIF or the client).
-- Rows that predate it get the migration time. Not in ImageMetadata: only the stale-assessment sweep reads it.
ALTER TABLE images ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Dispatch state is per incident, not per image. No row = not yet acted on.
CREATE TABLE IF NOT EXISTS incident_dispatch (
    incident_id UUID PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('awaiting', 'live', 'extinguished', 'archived')),
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 'archived' added after the table shipped: an extinguished fire filed into the Archive. Re-runnable.
ALTER TABLE incident_dispatch DROP CONSTRAINT IF EXISTS incident_dispatch_state_check;
ALTER TABLE incident_dispatch ADD CONSTRAINT incident_dispatch_state_check CHECK (state IN ('awaiting', 'live', 'extinguished', 'archived'));

-- Audit trail: append-only, never updated or deleted (Sprint 2 §1.5 #5/#6).
CREATE TABLE IF NOT EXISTS decisions (
    id BIGSERIAL PRIMARY KEY,
    incident_id UUID NOT NULL,
    image_id UUID,
    field TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    decided_by TEXT NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_incident_idx ON decisions (incident_id, decided_at DESC);

-- Comments on an incident from coordinators and crews: an operational log, so append-only
-- like `decisions` (no update or delete endpoint).
CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,
    incident_id UUID NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_incident_idx ON comments (incident_id, created_at DESC);

-- Response crews (docs/live/dispatch-crews.md §4, §8). A station (firehouse) has a fixed location
-- and several crews; assigning a crew to an incident creates an assignment.
CREATE TABLE IF NOT EXISTS stations (
    station_id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS crews (
    crew_id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES stations,
    label TEXT NOT NULL UNIQUE,
    crew_type TEXT NOT NULL CHECK (crew_type IN ('light', 'heavy', 'aerial'))
);

CREATE TABLE IF NOT EXISTS assignments (
    assignment_id BIGSERIAL PRIMARY KEY,
    incident_id UUID NOT NULL,
    crew_id UUID NOT NULL REFERENCES crews,
    status TEXT NOT NULL CHECK (status IN ('dispatched', 'en_route', 'on_scene', 'cleared')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A crew can't be on two incidents at once: enforced here, not in app code.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_assignment_per_crew ON assignments (crew_id) WHERE status <> 'cleared';
CREATE INDEX IF NOT EXISTS assignments_incident_idx ON assignments (incident_id);

-- Demo stations and crews, seeded here so every database (staging, prod) has the same ones after
-- a deploy. Fixed ids; re-runnable. Coordinates are approximate.
-- ponytail: seeded in the schema because there's no crew-management UI; move to a script or UI when crews change often.
INSERT INTO stations (station_id, name, latitude, longitude) VALUES
    ('5a000000-0000-4000-8000-000000000001', 'Kinglake', -37.5236, 145.3434),
    ('5a000000-0000-4000-8000-000000000002', 'Healesville', -37.6541, 145.5153),
    ('5a000000-0000-4000-8000-000000000003', 'Moorabbin Airport', -37.9758, 145.1022)
ON CONFLICT (station_id) DO NOTHING;

INSERT INTO crews (crew_id, station_id, label, crew_type) VALUES
    ('c0000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'Kinglake Light 1', 'light'),
    ('c0000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'Kinglake Heavy 1', 'heavy'),
    ('c0000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'Kinglake Heavy 2', 'heavy'),
    ('c0000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000002', 'Healesville Light 1', 'light'),
    ('c0000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000002', 'Healesville Heavy 1', 'heavy'),
    ('c0000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000003', 'Moorabbin Aerial 1', 'aerial'),
    ('c0000000-0000-4000-8000-000000000007', '5a000000-0000-4000-8000-000000000003', 'Moorabbin Aerial 2', 'aerial')
ON CONFLICT (crew_id) DO NOTHING;

-- 'crew' source added with the Crew tab: photos a response crew uploads from the fire. Re-runnable.
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_source_type_check;
ALTER TABLE images ADD CONSTRAINT images_source_type_check CHECK (source_type IN ('drone', 'cctv', 'citizen', 'satellite', 'crew'));

-- A crew on scene asking for more help. Fulfilled when another crew is dispatched to the incident,
-- dismissed by the coordinator or when the fire stops being live.
CREATE TABLE IF NOT EXISTS support_requests (
    id BIGSERIAL PRIMARY KEY,
    incident_id UUID NOT NULL,
    crew_id UUID NOT NULL REFERENCES crews,
    crew_type TEXT CHECK (crew_type IN ('light', 'heavy', 'aerial')),
    note TEXT CHECK (length(note) <= 500),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_requests_open_idx ON support_requests (incident_id) WHERE status = 'open';
