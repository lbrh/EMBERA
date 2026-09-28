import { distanceKm } from "@/lib/utils/geo";
import { incidentRef } from "@/lib/utils/ref";
import type {
  ApiIncidentRecord,
  DispatchState,
  ElementScores,
  FlameVisibility,
  Incident,
  InfrastructureImpact,
  PipelineFlag,
  SeverityBand,
  SeverityProvenance,
  SmokeDensity,
  VegetationImpact,
} from "@/lib/types";


/** Archive reason shown for an extinguished fire the coordinator filed away. */
export const ARCHIVED_REASON = "Extinguished fire, archived.";

// 1-4 weights, same tables as backend/src/pipeline/assess-severity.ts. Only used to show the
// "scored X of 16" breakdown — the band itself always comes from the backend's severityScore.
const SMOKE_LEVEL: Record<SmokeDensity, number> = {
  none_or_haze: 1,
  moderate: 2,
  dense_dark: 3,
  very_dense_blocking_vision: 4,
};

const FLAME_LEVEL: Record<FlameVisibility, number> = {
  no_visible_flame: 1,
  some_flame: 2,
  visible_high_flames_and_embers: 3,
  large_flame_wall_embers_everywhere: 4,
};

const VEGETATION_LEVEL: Record<VegetationImpact, number> = {
  no_vegetation: 1,
  sparse_vegetation: 2,
  moderate_vegetation: 3,
  dense_vegetation: 4,
};

const INFRASTRUCTURE_LEVEL: Record<InfrastructureImpact, number> = {
  no_infrastructure: 1,
  sparse_infrastructure: 2,
  moderate_infrastructure: 3,
  dense_infrastructure: 4,
};

function elementsFrom(record: ApiIncidentRecord): ElementScores {
  const smoke = record.smokeDensity ? SMOKE_LEVEL[record.smokeDensity] : null;
  const flame = record.flameVisibility ? FLAME_LEVEL[record.flameVisibility] : null;
  // Vegetation is fuel, not fire: backend scores it 0 unless smoke or flame is above level 1.
  const fire = (smoke ?? 0) > 1 || (flame ?? 0) > 1;
  return {
    smoke,
    flame,
    vegetation: record.vegetationImpact ? (fire ? VEGETATION_LEVEL[record.vegetationImpact] : 0) : null,
    infrastructure: record.infrastructureImpact ? INFRASTRUCTURE_LEVEL[record.infrastructureImpact] : null,
  };
}

function sumOf(elements: ElementScores): number | null {
  const { smoke, flame, vegetation, infrastructure } = elements;
  if (smoke == null || flame == null || vegetation == null || infrastructure == null) return null;
  return smoke + flame + vegetation + infrastructure;
}

function provenanceOf(record: ApiIncidentRecord): SeverityProvenance {
  if (record.severityScoreOverride != null) {
    return record.severityScoreOverride === record.severityScore ? "ai_confirmed_by_coordinator" : "coordinator_override";
  }
  if (record.severityScore != null) return "ai_classified";
  return "none";
}

/** The coordinator's label wins over the AI's (same pattern as the severity override). */
function labelOf(record: ApiIncidentRecord) {
  return record.classificationLabelOverride ?? record.classificationLabel;
}

// Routing is decided by the backend (0.75 threshold, uncertain label) — the UI only reads it.
function flagOf(record: ApiIncidentRecord, isDiscarded: boolean): PipelineFlag {
  if (isDiscarded || labelOf(record) === "non_fire") return "not_a_fire";
  // pending_review = not assessed yet; never show that as confirmed (Sprint 2 §1.5 #2).
  if (record.assessmentStatus !== "assessed") return "flagged_review";
  return "processed";
}

export interface NormalizeOptions {
  /** Set true for images the coordinator (or the AI gate) has dismissed as not a fire. */
  discarded?: boolean;
  place?: string;
}

export function normalizeIncident(
  record: ApiIncidentRecord,
  opts: NormalizeOptions = {}
): Incident {
  const elements = elementsFrom(record);
  const sum = sumOf(elements);
  const flag = flagOf(record, Boolean(opts.discarded));
  // A flagged image never gets an applied band — the indicator sum is only the AI's provisional
  // read, shown on Manual Review but not used for the map/ranking until a coordinator acts.
  const band: SeverityBand | 0 =
    flag === "flagged_review" ? 0 : ((record.severityScoreOverride ?? record.severityScore ?? 0) as SeverityBand | 0);
  // The coordinator's dispatch state wins; otherwise a confirmed fire enters the dispatch order
  // (Sprint 2 §1.3) and an image the AI read as burnt out counts as extinguished.
  const dispatch: DispatchState =
    record.dispatchState ??
    (labelOf(record) === "extinguished" ? "extinguished" : flag === "processed" && band > 0 ? "awaiting" : "unranked");
  const discardedByCoordinator = record.classificationLabelOverride === "non_fire";
  const archived = dispatch === "archived";
  const dispatchBy = record.dispatchUpdatedBy ?? null;
  const dispatchAt = record.dispatchUpdatedAt ?? null;

  return {
    id: record.incidentId,
    ref: incidentRef(record.incidentId),
    // coordinates only until the backend's reverse geocode has filled in the place name
    place: opts.place ?? record.placeName ?? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`,
    coords: { lat: record.latitude, lng: record.longitude },
    capturedAtIso: record.timestamp,
    distanceKm: distanceKm({ lat: record.latitude, lng: record.longitude }),
    source: record.sourceType,
    file: record.imageId,

    elements,
    sum,
    band,
    confidence: record.confidenceScore,
    explanation: record.severityExplanation,
    reasonBullets: [],
    recommendedAction: null,

    provenance: provenanceOf(record),
    flag,
    dispatch,
    groupId: null,

    reviewReason:
      flag !== "flagged_review"
        ? null
        : record.assessmentStatus === "pending_review"
          ? "ai_assessing"
          : record.classificationLabelOverride === "uncertain"
          ? "restored_not_fire"
          : record.classificationLabel === "uncertain" && elements.smoke === 1 && elements.flame === 1
            ? "no_fire_detected"
            : "below_threshold",
    reviewReasonNote: null,

    dismissedReason: archived
      ? ARCHIVED_REASON
      : flag !== "not_a_fire" ? null : discardedByCoordinator ? "Discarded by reviewer — no fire present in the image." : "Classified as not a fire by the AI gate.",
    dismissedBy: archived ? dispatchBy : flag !== "not_a_fire" ? null : discardedByCoordinator ? record.overriddenBy : "AI classification gate",
    dismissedAtIso: archived ? dispatchAt : flag !== "not_a_fire" ? null : discardedByCoordinator ? record.overriddenAt : record.timestamp,

    extinguishedNote: dispatch === "extinguished" && dispatchBy ? "Crew reported the fire out" : null,
    extinguishedBy: dispatch === "extinguished" ? dispatchBy : null,
    extinguishedAtIso: dispatch === "extinguished" ? dispatchAt : null,
    weather: record.weather ?? null,

    backend: {
      imageId: record.imageId,
      severityScoreOverride: record.severityScoreOverride,
      classificationLabelOverride: record.classificationLabelOverride,
      assessmentStatus: record.assessmentStatus,
      dispatchState: record.dispatchState ?? null,
    },
  };
}
