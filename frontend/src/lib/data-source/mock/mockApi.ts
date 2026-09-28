import { normalizeIncident } from "@/lib/normalize";
import type {
  ApiIncidentRecord,
  Crew,
  CrewType,
  DecisionLogEntry,
  Incident,
  IncidentComment,
  SeverityBand,
  SourceType,
  SupportRequest,
} from "@/lib/types";
import { currentActor } from "../real/api";
import { seedDecisionLog, seedGroup, seedOverlay, seedRecords } from "./seed";

const LATENCY_MS = 350;

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * listIncidents()/getIncidentImages()/submitImage() mirror the documented ingestion API shape
 * (ApiIncidentRecord) and go through the same normalizeIncident() a real fetch response would.
 * Everything below that — confirm/change/discard/override/dispatch/extinguish/... — has no
 * backend endpoint documented yet (see the plan's "schema gap" list), so these simulate a
 * plausible response shape for the store to apply; swapping them for real calls later is
 * additive once those endpoints exist, not a rewrite.
 */
export async function listIncidents(): Promise<Incident[]> {
  const incidents = seedRecords.map((record) => {
    const overlay = seedOverlay[record.incidentId];
    return normalizeIncident(record, { discarded: overlay?.discarded, place: overlay?.place });
  });
  return delay(incidents);
}

/** Seed incidents have one image each. */
export async function getIncidentImages(id: string): Promise<Incident[]> {
  const record = seedRecords.find((r) => r.incidentId === id);
  if (!record) return delay([]);
  const overlay = seedOverlay[record.incidentId];
  return delay([normalizeIncident(record, { discarded: overlay?.discarded, place: overlay?.place })]);
}

/** Mock incidents have no stored files, so previews fall back to the filename placeholder. */
export function getImagePreviewUrl(_imageId: string, _width: 240 | 800 = 800): string | null {
  return null;
}

/** Mock incidents have no stored files, so the incident screen keeps its filename placeholder. */
export async function getImageUrl(_imageId: string): Promise<string | null> {
  return null;
}

export interface SubmitImagePayload {
  file?: File;
  fileName: string;
  /** Omitted = backend reads it from the image's EXIF. */
  latitude?: number;
  longitude?: number;
  timestamp?: string;
  sourceType: SourceType;
  notes?: string;
  /** Adds the photo to this incident instead of grouping it by location (crew uploads). */
  incidentId?: string;
  /** Demo-only hook so the four "Demo:" buttons on Submit can force a specific outcome. */
  demoOutcome?: "valid" | "low_confidence" | "not_fire";
}

let submitCounter = 2292;

export async function submitImage(payload: SubmitImagePayload): Promise<{
  ref: string;
  record: ApiIncidentRecord;
}> {
  // The mock can't read EXIF, so it rejects missing fields the way the backend would without it.
  const { latitude, longitude, timestamp } = payload;
  if (latitude == null || longitude == null) throw new Error("latitude and longitude are required");
  if (!timestamp) throw new Error("timestamp is required");
  const ref = `SUB-${submitCounter}`;
  const id = `INC-${submitCounter++}`; // counter, not random — can't collide with seed IDs

  const outcome = payload.demoOutcome ?? "valid";
  const base: ApiIncidentRecord = {
    incidentId: id,
    imageId: payload.fileName,
    storagePath: `/${id}/${payload.sourceType}/${timestamp}_${payload.fileName}`,
    timestamp,
    sourceType: payload.sourceType,
    latitude,
    longitude,
    severityScore: null,
    severityScoreOverride: null,
    overriddenBy: null,
    overriddenAt: null,
    severityExplanation: null,
    confidenceScore: null,
    assessmentStatus: "pending_review",
    priorityRank: null,
    uploadStatus: "stored",
    ingestionError: null,
    smokeDensity: null,
    flameVisibility: null,
    vegetationImpact: null,
    infrastructureImpact: null,
    classificationLabel: null,
    classificationLabelOverride: null,
    contentHash: null,
  };

  // Shapes match backend assessSeverity(): a confident non-fire is "assessed" with no indicators
  // and goes straight to Archive (Sprint 2 §1.3).
  if (outcome === "not_fire") {
    base.assessmentStatus = "assessed";
    base.classificationLabel = "non_fire";
  } else if (outcome === "low_confidence") {
    base.assessmentStatus = "unable_to_assess";
    base.classificationLabel = "fire";
    base.severityScore = 2;
    base.confidenceScore = 0.38;
    base.smokeDensity = "very_dense_blocking_vision";
    base.flameVisibility = "some_flame";
    base.vegetationImpact = "sparse_vegetation";
    base.infrastructureImpact = "no_infrastructure";
  } else {
    base.assessmentStatus = "assessed";
    base.classificationLabel = "fire";
    base.confidenceScore = 0.79;
    base.severityScore = 3;
    base.smokeDensity = "dense_dark";
    base.flameVisibility = "visible_high_flames_and_embers";
    base.vegetationImpact = "moderate_vegetation";
    base.infrastructureImpact = "moderate_infrastructure";
    base.severityExplanation =
      "Continuous flame front with two outbuildings 600 m downwind; sealed-road access available.";
  }

  seedRecords.push(base);
  return delay({ ref, record: base }, 900);
}

export async function confirmReview(_incident: Incident): Promise<Partial<Incident>> {
  return delay({ flag: "processed", provenance: "ai_confirmed_by_coordinator" });
}

export async function changeReview(
  _incident: Incident,
  level: SeverityBand
): Promise<Partial<Incident>> {
  return delay({
    flag: "processed",
    provenance: "coordinator_assigned",
    band: level,
    sum: null,
    elements: { smoke: null, flame: null, vegetation: null, infrastructure: null },
  });
}

export async function discardReview(_incident: Incident): Promise<Partial<Incident>> {
  return delay({
    flag: "not_a_fire",
    dismissedReason: "Discarded by reviewer — no fire present in the image.",
    dismissedBy: "EC · Emergency Coordinator",
    dismissedAtIso: new Date().toISOString(),
  });
}

export async function overrideSeverity(
  _incident: Incident,
  level: SeverityBand
): Promise<Partial<Incident>> {
  return delay({ band: level, provenance: "coordinator_override" });
}

// Same stations and crews the backend seeds (schema.sql), in memory until the page reloads.
const station = (name: string, lat: number, lng: number) => ({ name, coords: { lat, lng } });
const KINGLAKE = station("Kinglake", -37.5236, 145.3434);
const HEALESVILLE = station("Healesville", -37.6541, 145.5153);
const MOORABBIN = station("Moorabbin Airport", -37.9758, 145.1022);
const mockCrews: Crew[] = [
  { id: "c1", label: "Kinglake Light 1", type: "light", station: KINGLAKE, assignment: null },
  { id: "c2", label: "Kinglake Heavy 1", type: "heavy", station: KINGLAKE, assignment: null },
  { id: "c3", label: "Kinglake Heavy 2", type: "heavy", station: KINGLAKE, assignment: null },
  { id: "c4", label: "Healesville Light 1", type: "light", station: HEALESVILLE, assignment: null },
  { id: "c5", label: "Healesville Heavy 1", type: "heavy", station: HEALESVILLE, assignment: null },
  { id: "c6", label: "Moorabbin Aerial 1", type: "aerial", station: MOORABBIN, assignment: null },
  { id: "c7", label: "Moorabbin Aerial 2", type: "aerial", station: MOORABBIN, assignment: null },
];
let mockAssignmentId = 0;
let mockSupport: SupportRequest[] = [];
let mockSupportId = 0;

/** Frees every crew on an incident: what the backend does when an incident stops being live. */
function freeCrews(incidentId: string) {
  for (const crew of mockCrews) if (crew.assignment?.incidentId === incidentId) crew.assignment = null;
  mockSupport = mockSupport.filter((r) => r.incidentId !== incidentId);
}

export async function getCrews(): Promise<Crew[]> {
  return delay(mockCrews.map((c) => ({ ...c })));
}

export async function dispatchCrews(incident: Incident, crewIds: string[]): Promise<Partial<Incident>> {
  const crews = mockCrews.filter((c) => crewIds.includes(c.id));
  const busy = crews.find((c) => c.assignment);
  if (busy) throw new Error(`${busy.label} is already assigned to another incident`);
  const updatedAtIso = new Date().toISOString();
  for (const crew of crews) {
    crew.assignment = { id: `a-${++mockAssignmentId}`, incidentId: incident.id, status: "dispatched", updatedAtIso };
  }
  mockSupport = mockSupport.filter((r) => r.incidentId !== incident.id);
  return delay({ dispatch: "live", flag: "processed" });
}

export async function setCrewStatus(assignmentId: string, status: "en_route" | "on_scene"): Promise<void> {
  const crew = mockCrews.find((c) => c.assignment?.id === assignmentId);
  if (crew?.assignment) crew.assignment = { ...crew.assignment, status, updatedAtIso: new Date().toISOString() };
  return delay(undefined);
}

export async function falseAlarm(incident: Incident): Promise<Partial<Incident>> {
  freeCrews(incident.id);
  mockSupport = mockSupport.filter((r) => r.incidentId !== incident.id);
  return delay({ flag: "not_a_fire", dispatch: "archived" });
}

export async function getSupportRequests(): Promise<SupportRequest[]> {
  return delay([...mockSupport]);
}

export async function requestSupport(incidentId: string, crewId: string, crewType: CrewType | null, note: string): Promise<void> {
  const crew = mockCrews.find((c) => c.id === crewId);
  mockSupport.unshift({
    id: `s-${++mockSupportId}`,
    incidentId,
    crewId,
    crewLabel: crew?.label ?? crewId,
    crewType,
    note: note.trim() || null,
    createdAtIso: new Date().toISOString(),
  });
  return delay(undefined);
}

export async function dismissSupportRequest(id: string): Promise<void> {
  mockSupport = mockSupport.filter((r) => r.id !== id);
  return delay(undefined);
}

export async function recallCrew(assignmentId: string): Promise<void> {
  const crew = mockCrews.find((c) => c.assignment?.id === assignmentId);
  if (crew) crew.assignment = null;
  return delay(undefined);
}

export async function cancelDispatch(incident: Incident): Promise<Partial<Incident>> {
  freeCrews(incident.id);
  return delay({ dispatch: "awaiting" });
}

export async function markExtinguished(incident: Incident): Promise<Partial<Incident>> {
  freeCrews(incident.id);
  return delay({
    dispatch: "extinguished",
    extinguishedNote: "Crew reported the fire out",
    extinguishedBy: "EC · Emergency Coordinator",
    extinguishedAtIso: new Date().toISOString(),
  });
}

export async function reopenIncident(_incident: Incident): Promise<Partial<Incident>> {
  return delay({ dispatch: "live", extinguishedNote: null, extinguishedBy: null, extinguishedAtIso: null });
}

export async function archiveIncident(_incident: Incident): Promise<Partial<Incident>> {
  return delay({ dispatch: "archived" });
}

export async function sendToManualReview(_incident: Incident): Promise<Partial<Incident>> {
  return delay({
    flag: "flagged_review",
    band: 0,
    dispatch: "unranked",
    reviewReason: "sent_by_coordinator",
  });
}

export async function restoreFromArchive(_incident: Incident): Promise<Partial<Incident>> {
  return delay({
    flag: "flagged_review",
    dispatch: "unranked",
    reviewReason: "restored_not_fire",
    dismissedReason: null,
    dismissedBy: null,
    dismissedAtIso: null,
  });
}

/** Mock state lives only in the store, so undo is just the store restoring its snapshot. */
export async function undo(_prev: Incident, _current: Incident): Promise<void> {}

/** null = keep the store's local log (mock has no server-side log). */
export async function getDecisionLog(_incidentId: string): Promise<DecisionLogEntry[] | null> {
  return null;
}

// In-memory only: mock comments last until the page reloads.
const mockComments: IncidentComment[] = [];
let mockCommentId = 0;

export async function getComments(incidentId: string): Promise<IncidentComment[]> {
  return delay(mockComments.filter((c) => c.incidentId === incidentId));
}

export async function addComment(incidentId: string, body: string): Promise<IncidentComment> {
  const comment = { id: `c-${++mockCommentId}`, incidentId, body, who: currentActor(), whenIso: new Date().toISOString() };
  mockComments.unshift(comment);
  return delay(comment);
}

export type GroupAction = "confirmed" | "kept_separate";

export async function setGrouping(groupId: string, state: GroupAction) {
  return delay({ groupId, state });
}

// Merge and split rewrite incidents server-side; the mock seed has no server to do it against.
export async function mergeIncidents(_sourceId: string, _targetId: string): Promise<void> {
  throw new Error("Merging incidents needs the real backend.");
}

export async function splitImage(_imageId: string): Promise<string> {
  throw new Error("Splitting incidents needs the real backend.");
}

export function getSeedGroup() {
  return seedGroup;
}

export function getSeedDecisionLog() {
  return seedDecisionLog;
}
