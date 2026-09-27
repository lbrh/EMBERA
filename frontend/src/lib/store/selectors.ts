import type { DispatchState, Incident, SeverityBand } from "@/lib/types";
import type { MapFilter } from "@/lib/store/useIncidentStore";
import { distanceKm } from "@/lib/utils/geo";

function byIds(incidents: Record<string, Incident>, order: string[]): Incident[] {
  return order.map((id) => incidents[id]).filter(Boolean);
}

/** Severity desc, then distance-from-staging asc — matches the redline's ranking rule. */
function bySeverityThenDistance(a: Incident, b: Incident): number {
  if (a.band !== b.band) return (b.band as number) - (a.band as number);
  return a.distanceKm - b.distanceKm;
}

export function rankedAwaiting(incidents: Record<string, Incident>, order: string[]): Incident[] {
  return byIds(incidents, order)
    .filter((i) => i.dispatch === "awaiting" && i.band > 0)
    .sort(bySeverityThenDistance);
}

export function liveDispatched(incidents: Record<string, Incident>, order: string[]): Incident[] {
  return byIds(incidents, order).filter((i) => i.dispatch === "live");
}

export function reviewQueue(incidents: Record<string, Incident>, order: string[]): Incident[] {
  return byIds(incidents, order)
    .filter((i) => i.flag === "flagged_review")
    .sort((a, b) => (a.capturedAtIso < b.capturedAtIso ? 1 : -1));
}

/** Map filter -> the dispatch states it shows, shared by the map and the incidents list. */
const FILTER_STATES: Record<MapFilter, DispatchState[]> = {
  all: ["awaiting", "live", "extinguished"],
  active: ["awaiting"],
  dispatched: ["live"],
  extinguished: ["extinguished"],
};

/** Incidents for the map page's list and markers under a filter, most urgent first. */
export function filteredIncidents(
  incidents: Record<string, Incident>,
  order: string[],
  filter: MapFilter
): Incident[] {
  return byIds(incidents, order)
    .filter((i) => i.band > 0 && i.flag !== "not_a_fire" && FILTER_STATES[filter].includes(i.dispatch))
    .sort(bySeverityThenDistance);
}

/** Dismissed images plus extinguished fires the coordinator has archived. */
export function archiveList(incidents: Record<string, Incident>, order: string[]): Incident[] {
  return byIds(incidents, order)
    .filter((i) => i.flag === "not_a_fire" || i.dispatch === "archived")
    .sort((a, b) => ((a.dismissedAtIso ?? "") < (b.dismissedAtIso ?? "") ? 1 : -1));
}

export function resolvedList(incidents: Record<string, Incident>, order: string[]): Incident[] {
  return byIds(incidents, order)
    .filter((i) => i.dispatch === "extinguished")
    .sort((a, b) => ((a.extinguishedAtIso ?? "") < (b.extinguishedAtIso ?? "") ? 1 : -1));
}

/** Legend / map marker set: anything with an applied severity and not extinguished, per the
 * redline's "flagged and dismissed images are never drawn on the map" rule. */
export function mapMarkers(incidents: Record<string, Incident>, order: string[]): Incident[] {
  return byIds(incidents, order).filter(
    (i) => i.band > 0 && (i.dispatch === "awaiting" || i.dispatch === "live") && i.flag !== "not_a_fire"
  );
}

export function legendCounts(
  incidents: Record<string, Incident>,
  order: string[]
): Record<SeverityBand, number> {
  const counts: Record<SeverityBand, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const i of mapMarkers(incidents, order)) {
    if (i.band) counts[i.band as SeverityBand] += 1;
  }
  return counts;
}

export function nearby(
  incidents: Record<string, Incident>,
  order: string[],
  currentId: string,
  limit = 3
): Incident[] {
  return rankedAwaiting(incidents, order)
    .filter((i) => i.id !== currentId)
    .slice(0, limit);
}

const OPEN: DispatchState[] = ["awaiting", "live", "unranked"];

/** Open incidents within `maxKm` of this one, nearest first: the ones a coordinator might merge
 * in as reports of the same fire (the backend only merges open incidents). */
export function mergeCandidates(
  incidents: Record<string, Incident>,
  order: string[],
  currentId: string,
  maxKm = 15,
  limit = 4
): { incident: Incident; km: number }[] {
  const current = incidents[currentId];
  if (!current) return [];
  return byIds(incidents, order)
    .filter((i) => i.id !== currentId && OPEN.includes(i.dispatch) && i.flag !== "not_a_fire")
    .map((incident) => ({ incident, km: distanceKm(current.coords, incident.coords) }))
    .filter((c) => c.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export function rankOf(incidents: Record<string, Incident>, order: string[], id: string): number {
  const ranked = rankedAwaiting(incidents, order);
  const idx = ranked.findIndex((i) => i.id === id);
  return idx === -1 ? 0 : idx + 1;
}
