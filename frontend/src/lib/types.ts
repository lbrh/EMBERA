/**
 * Two layers, deliberately kept separate:
 *
 * - `ApiIncidentRecord` mirrors backend/src/metadata/metadata.types.ts — the shape the real API
 *   returns.
 * - `Incident` is the UI's view model: pre-computed band/sum/status, everything a
 *   component needs to render without re-deriving it. `normalizeIncident()` in normalize.ts is
 *   the single seam between the two, so mock data and real API data flow through identical code.
 *
 * Fields the UX spec needs that the backend schema doesn't scope yet (decision log, toasts,
 * archive/resolved provenance, grouping, dispatch crew, review reasons) live only on `Incident`
 * / the store, each marked `// TODO(api)` at the point they'd eventually need a backend field.
 */

// Mirrors backend/src/metadata/metadata.types.ts (the JSON the API actually returns). Keep the two in sync.
/** crew = a photo a response crew uploads from the fire (Crew tab). */
export type SourceType = "drone" | "cctv" | "citizen" | "satellite" | "crew";

export type AssessmentStatus = "assessed" | "unable_to_assess" | "pending_review";

export type UploadStatus = "pending" | "stored" | "failed";

export type ClassificationLabel = "fire" | "non_fire" | "extinguished" | "uncertain";

export type SmokeDensity =
  | "none_or_haze"
  | "moderate"
  | "dense_dark"
  | "very_dense_blocking_vision";

export type FlameVisibility =
  | "no_visible_flame"
  | "some_flame"
  | "visible_high_flames_and_embers"
  | "large_flame_wall_embers_everywhere";

/** Amount of vegetation (fuel load) in frame, burning or not. */
export type VegetationImpact =
  | "no_vegetation"
  | "sparse_vegetation"
  | "moderate_vegetation"
  | "dense_vegetation";

/** Amount of infrastructure in/near the scene, burning or not. */
export type InfrastructureImpact =
  | "no_infrastructure"
  | "sparse_infrastructure"
  | "moderate_infrastructure"
  | "dense_infrastructure";

/** Wire shape: backend ImageMetadata (GET /incidents, /incidents/:id, /order). */
export interface ApiIncidentRecord {
  incidentId: string;
  imageId: string;
  storagePath: string | null;
  timestamp: string; // ISO 8601
  sourceType: SourceType;
  latitude: number;
  longitude: number;

  severityScore: number | null; // 1-4, AI output, never overwritten
  severityScoreOverride: number | null; // 1-4, coordinator override, takes effect when present
  overriddenBy: string | null;
  overriddenAt: string | null;

  confidenceScore: number | null; // 0-1, min() across the four indicator confidences
  severityExplanation: string | null;

  smokeDensity: SmokeDensity | null;
  flameVisibility: FlameVisibility | null;
  vegetationImpact: VegetationImpact | null;
  infrastructureImpact: InfrastructureImpact | null;

  assessmentStatus: AssessmentStatus;
  classificationLabel: ClassificationLabel | null;
  classificationLabelOverride: ClassificationLabel | null; // coordinator's call; AI label never overwritten
  priorityRank: number | null;
  uploadStatus: UploadStatus;
  ingestionError: string | null;
  contentHash: string | null;
  /** Locality at the coordinates ("Kinglake"), reverse geocoded after ingest; null until then. */
  placeName?: string | null;
  /** Incident reads only (GET /incidents, /incidents/:id, /order); null = no coordinator dispatch yet. */
  dispatchState?: BackendDispatchState | null;
  /** Who set the current dispatch state, and when (incident reads only). */
  dispatchUpdatedBy?: string | null;
  dispatchUpdatedAt?: string | null;
  /** Weather and fire danger at the coordinates, looked up after ingest; null until then. */
  weather?: FireWeather | null;
}

/** Mirrors backend FireWeather (backend/src/metadata/metadata.types.ts). */
export interface FireWeather {
  observedAt: string;
  temperatureC: number;
  humidityPct: number;
  windKmh: number;
  windFromDeg: number; // the direction the wind blows FROM
  ffdi: number; // McArthur Forest Fire Danger Index
}

/** archived = an extinguished fire the coordinator has filed away (Resolved -> Archive). */
export type BackendDispatchState = "awaiting" | "live" | "extinguished" | "archived";

/** The coordinator-editable values as the backend currently holds them — what Undo sends back. */
export interface BackendReviewState {
  imageId: string;
  severityScoreOverride: number | null;
  classificationLabelOverride: ClassificationLabel | null;
  assessmentStatus: AssessmentStatus;
  dispatchState: BackendDispatchState | null;
}

export type SeverityBand = 1 | 2 | 3 | 4;

/** One of three mutually exclusive pipeline flags (redline "three distinct states"). */
export type PipelineFlag = "processed" | "flagged_review" | "not_a_fire";

/** Dispatch lifecycle, tracked separately from the pipeline flag. */
export type DispatchState = "unranked" | "awaiting" | "live" | "extinguished" | "archived";

export type SeverityProvenance =
  | "ai_classified"
  | "ai_confirmed_by_coordinator"
  | "coordinator_assigned"
  | "coordinator_override"
  | "none";

export interface ElementScores {
  smoke: number | null;
  flame: number | null;
  vegetation: number | null; // 0 when no fire present (backend effectiveVegetationWeight)
  infrastructure: number | null;
}

export interface DecisionLogEntry {
  id: string;
  incidentId: string;
  summary: string; // e.g. "Severity changed from Catastrophic (4) to Extreme (3)"
  who: string;
  whenIso: string;
}

export type CrewType = "light" | "heavy" | "aerial";
/** dispatched -> en_route -> on_scene; cleared = recalled or the fire is over (not shown on a crew). */
export type AssignmentStatus = "dispatched" | "en_route" | "on_scene" | "cleared";

export interface CrewAssignment {
  id: string;
  incidentId: string;
  status: AssignmentStatus;
  updatedAtIso: string;
}

/** A response crew, its station, and what it's doing now (assignment null = available). */
export interface Crew {
  id: string;
  label: string;
  type: CrewType;
  station: { name: string; coords: { lat: number; lng: number } };
  assignment: CrewAssignment | null;
}

/** A crew on scene asking for more help. crewType null = any crew. */
export interface SupportRequest {
  id: string;
  incidentId: string;
  crewId: string;
  crewLabel: string;
  crewType: CrewType | null;
  note: string | null;
  createdAtIso: string;
}

/** A comment on an incident. Permanent: comments are never edited or deleted. */
export interface IncidentComment {
  id: string;
  incidentId: string;
  body: string;
  who: string;
  whenIso: string;
}

export type ReviewReason =
  | "below_threshold"
  | "sent_by_coordinator"
  | "restored_not_fire"
  | "restored_discarded";

export type GroupState = "suggested" | "confirmed" | "kept_separate";

export interface IncidentGroup {
  id: string;
  memberIds: string[];
  state: GroupState;
  proximityKm: number;
  windowHours: number;
}

/** UI view model — what every component actually consumes. */
export interface Incident {
  id: string;
  /** Short display reference ("INC-K7Q2MX") derived from `id`; `id` stays the real key. */
  ref: string;
  place: string;
  coords: { lat: number; lng: number };
  capturedAtIso: string;
  distanceKm: number;
  source: SourceType;
  file: string;

  elements: ElementScores;
  sum: number | null; // 4-16, null when coordinator-assigned or not scored
  band: SeverityBand | 0; // 0 = no severity applied (flagged)
  confidence: number | null; // 0-1
  explanation: string | null;
  reasonBullets: string[];
  recommendedAction: string | null;

  provenance: SeverityProvenance;
  flag: PipelineFlag;
  dispatch: DispatchState;
  groupId: string | null;

  reviewReason: ReviewReason | null;
  reviewReasonNote: string | null;

  dismissedReason: string | null;
  dismissedBy: string | null;
  dismissedAtIso: string | null;

  extinguishedNote: string | null;
  extinguishedBy: string | null;
  extinguishedAtIso: string | null;

  /** Server-side values of the coordinator-editable fields, sent back by Undo (real API). */
  backend: BackendReviewState;
  /** Weather at the newest image; drives the spread envelope on the map. Absent in mock data. */
  weather?: FireWeather | null;
}
