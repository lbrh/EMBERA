import { ARCHIVED_REASON, normalizeIncident } from "@/lib/normalize";
import { OPERATING_REGION } from "@/lib/utils/geo";
import { bandFromSum } from "@/lib/constants/severity";
import { incidentRef } from "@/lib/utils/ref";
import type {
  ApiIncidentRecord,
  AssignmentStatus,
  BackendDispatchState,
  ClassificationLabel,
  Crew,
  CrewType,
  DecisionLogEntry,
  SupportRequest,
  Incident,
  IncidentComment,
  SeverityBand,
  CrewStep,
} from "@/lib/types";
import type { SubmitImagePayload } from "../mock/mockApi";

/**
 * Real API implementation — same signatures as mock/mockApi.ts. Calls go through the Next.js
 * proxy at /api/backend (src/app/api/backend/[...path]/route.ts), which adds the API key
 * server-side. Coordinator actions map onto PATCH /images/:id/decision and PUT /incidents/:id/dispatch;
 * grouping has no backend endpoint yet and still throws.
 */
const BASE = "/api/backend";

// ponytail: one fetch for the whole region; switch to per-viewport queries if incident volume grows.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

export async function listIncidents(): Promise<Incident[]> {
  const query = new URLSearchParams(Object.entries(OPERATING_REGION).map(([k, v]) => [k, String(v)]));
  const records = await request<ApiIncidentRecord[]>(`/incidents?${query}`);
  return records.map((r) => normalizeIncident(r));
}

/** Every image at the incident, newest first, each normalised with its own rating. */
export async function getIncidentImages(id: string): Promise<Incident[]> {
  const images = await request<ApiIncidentRecord[]>(`/incidents/${encodeURIComponent(id)}`);
  return images.map((r) => normalizeIncident(r));
}

/** Downscaled WebP of the stored image, cached by the browser. Safe to use as an <img> src. */
export function getImagePreviewUrl(imageId: string, width: 240 | 800 = 800): string | null {
  return `${BASE}/images/${encodeURIComponent(imageId)}/preview?w=${width}`;
}

/** Signed link to the full-resolution stored image, valid for 15 minutes. */
export async function getImageUrl(imageId: string): Promise<string | null> {
  const { url } = await request<{ url: string }>(`/images/${encodeURIComponent(imageId)}`);
  return url;
}

export async function submitImage(
  payload: SubmitImagePayload
): Promise<{ ref: string; record: ApiIncidentRecord }> {
  if (!payload.file) throw new Error("An image file is required.");
  const form = new FormData();
  form.append("image", payload.file);
  form.append("source_type", payload.sourceType);
  // omitted fields fall back to the image's EXIF on the backend
  if (payload.latitude != null) form.append("latitude", String(payload.latitude));
  if (payload.longitude != null) form.append("longitude", String(payload.longitude));
  if (payload.timestamp) form.append("timestamp", payload.timestamp);
  if (payload.incidentId) form.append("incident_id", payload.incidentId);
  const record = await request<ApiIncidentRecord>("/ingest", { method: "POST", body: form });
  return { ref: record.imageId, record };
}

function notImplemented(name: string): never {
  throw new Error(`No backend endpoint for ${name}() yet.`);
}

// ponytail: sent as `by` on every decision; there's no login yet, so the backend records it unverified.
export const COORDINATOR_NAME = "EC · Emergency Coordinator";

// Who this browser is acting as: the coordinator, or the crew picked on the crew view. Stands in for
// each person's own login (out of scope), so every action is recorded against the right name.
let actor = COORDINATOR_NAME;
export function setActor(name: string) {
  actor = name;
}
export function currentActor() {
  return actor;
}

type ReviewPatch = {
  severityScoreOverride?: number | null;
  classificationLabelOverride?: ClassificationLabel | null;
  assessmentStatus?: "assessed" | "unable_to_assess";
};

const jsonInit = (method: string, body: object): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...body, by: actor }),
});

// The review fields of an incident as the server now has them — merged into the store by the caller.
function reviewFields(record: ApiIncidentRecord, incident: Incident): Partial<Incident> {
  const next = normalizeIncident({ ...record, dispatchState: incident.backend.dispatchState });
  const { flag, band, provenance, reviewReason, dismissedReason, dismissedBy, dismissedAtIso, dispatch, backend } = next;
  return { flag, band, provenance, reviewReason, dismissedReason, dismissedBy, dismissedAtIso, dispatch, backend };
}

async function decide(incident: Incident, patch: ReviewPatch): Promise<Partial<Incident>> {
  const record = await request<ApiIncidentRecord>(
    `/images/${incident.backend.imageId}/decision`,
    jsonInit("PATCH", patch)
  );
  return reviewFields(record, incident);
}

async function setDispatch(incident: Incident, state: BackendDispatchState): Promise<Partial<Incident>> {
  await request(`/incidents/${encodeURIComponent(incident.id)}/dispatch`, jsonInit("PUT", { state }));
  const now = new Date().toISOString();
  const archived = state === "archived";
  return {
    dispatch: state,
    backend: { ...incident.backend, dispatchState: state },
    extinguishedNote: state === "extinguished" ? "Crew reported the fire out" : null,
    extinguishedBy: state === "extinguished" ? COORDINATOR_NAME : null,
    extinguishedAtIso: state === "extinguished" ? now : null,
    dismissedReason: archived ? ARCHIVED_REASON : incident.dismissedReason,
    dismissedBy: archived ? COORDINATOR_NAME : incident.dismissedBy,
    dismissedAtIso: archived ? now : incident.dismissedAtIso,
  };
}

/** Confirming keeps the AI's own provisional score, recorded as the coordinator's decision. */
export async function confirmReview(incident: Incident): Promise<Partial<Incident>> {
  if (incident.sum == null) throw new Error("There's no AI severity to confirm — assign one instead.");
  return decide(incident, {
    severityScoreOverride: bandFromSum(incident.sum),
    classificationLabelOverride: "fire",
    assessmentStatus: "assessed",
  });
}

export async function changeReview(incident: Incident, level: SeverityBand): Promise<Partial<Incident>> {
  return decide(incident, { severityScoreOverride: level, classificationLabelOverride: "fire", assessmentStatus: "assessed" });
}

export async function discardReview(incident: Incident): Promise<Partial<Incident>> {
  return decide(incident, { classificationLabelOverride: "non_fire", assessmentStatus: "assessed" });
}

export async function overrideSeverity(incident: Incident, level: SeverityBand): Promise<Partial<Incident>> {
  return decide(incident, { severityScoreOverride: level });
}

export async function sendToManualReview(incident: Incident): Promise<Partial<Incident>> {
  return decide(incident, { assessmentStatus: "unable_to_assess" });
}

/** "uncertain" puts it back in review even when the AI itself said non-fire. */
export async function restoreFromArchive(incident: Incident): Promise<Partial<Incident>> {
  return decide(incident, { classificationLabelOverride: "uncertain", assessmentStatus: "unable_to_assess" });
}

/** Sends crews to the incident; the backend makes it live in the same step. */
export async function dispatchCrews(incident: Incident, crewIds: string[]): Promise<Partial<Incident>> {
  await request(`/incidents/${encodeURIComponent(incident.id)}/assignments`, jsonInit("POST", { crewIds }));
  return { dispatch: "live", flag: "processed", backend: { ...incident.backend, dispatchState: "live" } };
}
export const cancelDispatch = (incident: Incident) => setDispatch(incident, "awaiting");
export const markExtinguished = (incident: Incident) => setDispatch(incident, "extinguished");
export const reopenIncident = (incident: Incident) => setDispatch(incident, "live");
export const archiveIncident = (incident: Incident) => setDispatch(incident, "archived");

/** Puts the server back to the snapshot taken before the action, sending only what changed.
 * The backend logs the undo like any other decision. */
export async function undo(prev: Incident, current: Incident): Promise<void> {
  const before = prev.backend;
  const now = current.backend;
  const reviewChanged =
    before.severityScoreOverride !== now.severityScoreOverride ||
    before.classificationLabelOverride !== now.classificationLabelOverride ||
    before.assessmentStatus !== now.assessmentStatus;
  if (reviewChanged) {
    await request(
      `/images/${before.imageId}/decision`,
      jsonInit("PATCH", {
        severityScoreOverride: before.severityScoreOverride,
        classificationLabelOverride: before.classificationLabelOverride,
        // pending_review can't be set by a coordinator; it means "not yet assessed", same as needing review
        assessmentStatus: before.assessmentStatus === "assessed" ? "assessed" : "unable_to_assess",
      })
    );
  }
  if (before.dispatchState !== now.dispatchState) {
    // no dispatch row before = the default "awaiting" for a confirmed fire
    await request(`/incidents/${encodeURIComponent(prev.id)}/dispatch`, jsonInit("PUT", { state: before.dispatchState ?? "awaiting" }));
  }
}

interface ApiDecision {
  id: number;
  incidentId: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  decidedBy: string;
  decidedAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  severityScoreOverride: "Severity",
  severityScore: "AI severity (fire weather)",
  classificationLabelOverride: "Classification",
  assessmentStatus: "Review status",
  dispatchState: "Dispatch",
};

const STEP_LABELS: Record<string, string> = { dispatched: "dispatched", en_route: "en route", on_scene: "on scene", cleared: "cleared" };

function decisionSummary(d: ApiDecision): string {
  // crew steps are logged as field "crew:<label>", e.g. "Kinglake Heavy 1: en route → on scene"
  if (d.field.startsWith("crew:")) {
    const step = (s: string | null) => (s ? (STEP_LABELS[s] ?? s) : null);
    return d.fromValue ? `${d.field.slice(5)}: ${step(d.fromValue)} → ${step(d.toValue)}` : `${d.field.slice(5)} ${step(d.toValue)}`;
  }
  if (d.field === "mergedFrom") return `Merged in ${incidentRef(d.toValue ?? "")}: its images, crews, comments and history now live here`;
  if (d.field === "splitTo") return `An image was split off into ${incidentRef(d.toValue ?? "")}`;
  if (d.field === "splitFrom") return `Split off from ${incidentRef(d.toValue ?? "")}`;
  if (d.field === "supportRequest") {
    return d.fromValue ? `Support request ${d.toValue}` : `Support requested: ${d.toValue === "any crew" ? "any crew" : `${d.toValue} crew`}`;
  }
  return `${FIELD_LABELS[d.field] ?? d.field}: ${d.fromValue ?? "none"} → ${d.toValue ?? "none"}`;
}

export async function getDecisionLog(incidentId: string): Promise<DecisionLogEntry[]> {
  const decisions = await request<ApiDecision[]>(`/incidents/${encodeURIComponent(incidentId)}/decisions`);
  return decisions.map((d) => ({
    id: String(d.id),
    incidentId: d.incidentId,
    summary: decisionSummary(d),
    who: d.decidedBy,
    whenIso: d.decidedAt,
  }));
}

interface ApiComment {
  id: number;
  incidentId: string;
  author: string;
  body: string;
  createdAt: string;
}

const toComment = (c: ApiComment): IncidentComment => ({
  id: String(c.id),
  incidentId: c.incidentId,
  body: c.body,
  who: c.author,
  whenIso: c.createdAt,
});

/** Comments on an incident, newest first. */
export async function getComments(incidentId: string): Promise<IncidentComment[]> {
  const comments = await request<ApiComment[]>(`/incidents/${encodeURIComponent(incidentId)}/comments`);
  return comments.map(toComment);
}

export async function addComment(incidentId: string, body: string): Promise<IncidentComment> {
  const comment = await request<ApiComment>(`/incidents/${encodeURIComponent(incidentId)}/comments`, jsonInit("POST", { body }));
  return toComment(comment);
}

interface ApiCrew {
  crewId: string;
  label: string;
  crewType: CrewType;
  station: { name: string; latitude: number; longitude: number };
  assignment: { assignmentId: number; incidentId: string; status: AssignmentStatus; updatedAt: string } | null;
}

export async function getCrews(): Promise<Crew[]> {
  const crews = await request<ApiCrew[]>("/crews");
  return crews.map((c) => ({
    id: c.crewId,
    label: c.label,
    type: c.crewType,
    station: { name: c.station.name, coords: { lat: c.station.latitude, lng: c.station.longitude } },
    assignment: c.assignment && {
      id: String(c.assignment.assignmentId),
      incidentId: c.assignment.incidentId,
      status: c.assignment.status,
      updatedAtIso: c.assignment.updatedAt,
    },
  }));
}

/** A crew moves itself along: en route, then on scene. */
export async function setCrewStatus(assignmentId: string, status: CrewStep): Promise<void> {
  await request(`/assignments/${encodeURIComponent(assignmentId)}`, jsonInit("PATCH", { status }));
}

/** A crew on scene reports no fire: the image is marked not a fire and the incident archived,
 * which frees every crew on it. */
export async function falseAlarm(incident: Incident): Promise<Partial<Incident>> {
  const review = await decide(incident, { classificationLabelOverride: "non_fire", assessmentStatus: "assessed" });
  // carry the new label into `backend`, or Undo would think only the dispatch state changed
  const dispatch = await setDispatch({ ...incident, backend: review.backend ?? incident.backend }, "archived");
  return { ...review, ...dispatch };
}

interface ApiSupportRequest {
  id: number;
  incidentId: string;
  crewId: string;
  crewLabel: string;
  crewType: CrewType | null;
  note: string | null;
  createdAt: string;
}

/** Open support requests, newest first. */
export async function getSupportRequests(): Promise<SupportRequest[]> {
  const requests = await request<ApiSupportRequest[]>("/support-requests");
  return requests.map(({ id, createdAt, ...rest }) => ({ ...rest, id: String(id), createdAtIso: createdAt }));
}

export async function requestSupport(incidentId: string, crewId: string, crewType: CrewType | null, note: string): Promise<void> {
  await request(`/incidents/${encodeURIComponent(incidentId)}/support-requests`, jsonInit("POST", { crewId, crewType, note }));
}

export async function dismissSupportRequest(id: string): Promise<void> {
  await request(`/support-requests/${encodeURIComponent(id)}`, jsonInit("PATCH", { status: "dismissed" }));
}

/** Recalls a crew (clears its assignment). The backend puts the incident back in the order if it was the last crew. */
export async function recallCrew(assignmentId: string): Promise<void> {
  await request(`/assignments/${encodeURIComponent(assignmentId)}`, jsonInit("PATCH", { status: "cleared" }));
}

/** Folds `sourceId` into `targetId`: images, crews, comments and history move; the source is gone. */
export async function mergeIncidents(sourceId: string, targetId: string): Promise<void> {
  await request(`/incidents/${encodeURIComponent(sourceId)}/merge`, jsonInit("POST", { intoIncidentId: targetId }));
}

/** Moves one image into a new incident of its own; returns the new incident's id. */
export async function splitImage(imageId: string): Promise<string> {
  const { incidentId } = await request<{ incidentId: string }>(`/images/${encodeURIComponent(imageId)}/split`, jsonInit("POST", {}));
  return incidentId;
}

export async function setGrouping(
  ..._args: Parameters<typeof import("../mock/mockApi").setGrouping>
): ReturnType<typeof import("../mock/mockApi").setGrouping> {
  return notImplemented("setGrouping");
}
