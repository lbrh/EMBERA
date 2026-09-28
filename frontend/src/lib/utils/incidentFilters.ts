import type { Incident, SeverityBand, SourceType } from "@/lib/types";
import { SEVERITY } from "@/lib/constants/severity";
import { SOURCE_META } from "@/components/primitives/SourceChip";

/** The severity/flag key a filter chip toggles: a real band, or "not_a_fire" for dismissed images. */
export type SeverityFilterValue = SeverityBand | "not_a_fire";

export interface IncidentFilters {
  location: string;
  lat: string;
  lng: string;
  severities: SeverityFilterValue[];
  sources: SourceType[];
  dateFrom: string; // yyyy-mm-dd, local
  dateTo: string; // yyyy-mm-dd, local
  decidedBy: string;
}

export const EMPTY_FILTERS: IncidentFilters = {
  location: "",
  lat: "",
  lng: "",
  severities: [],
  sources: [],
  dateFrom: "",
  dateTo: "",
  decidedBy: "",
};

export function countActiveFilters(f: IncidentFilters): number {
  let n = 0;
  if (f.location.trim()) n += 1;
  if (f.lat.trim()) n += 1;
  if (f.lng.trim()) n += 1;
  if (f.severities.length > 0) n += 1;
  if (f.sources.length > 0) n += 1;
  if (f.dateFrom || f.dateTo) n += 1;
  if (f.decidedBy.trim()) n += 1;
  return n;
}

function severityKey(incident: Incident): SeverityFilterValue | null {
  if (incident.flag === "not_a_fire") return "not_a_fire";
  return incident.band ? (incident.band as SeverityBand) : null;
}

/** Concatenated, lowercased text of everything a person could plausibly search this record by. */
export function searchableText(incident: Incident): string {
  const key = severityKey(incident);
  const severityLabel = key === "not_a_fire" ? "not a fire" : key ? SEVERITY[key].label : "";
  const dates = [incident.capturedAtIso, incident.dismissedAtIso, incident.extinguishedAtIso]
    .filter((iso): iso is string => !!iso)
    .flatMap((iso) => [new Date(iso).toLocaleDateString(), new Date(iso).toLocaleTimeString()]);

  return [
    incident.ref,
    incident.place,
    incident.coords.lat.toFixed(4),
    incident.coords.lng.toFixed(4),
    severityLabel,
    SOURCE_META[incident.source].label,
    SOURCE_META[incident.source].abbr,
    incident.dismissedReason,
    incident.dismissedBy,
    incident.extinguishedNote,
    incident.extinguishedBy,
    incident.recommendedAction,
    incident.explanation,
    ...dates,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesSearch(incident: Incident, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return searchableText(incident).includes(q);
}

function startOfDay(yyyyMmDd: string): Date {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  return d;
}

function endOfDay(yyyyMmDd: string): Date {
  const d = new Date(`${yyyyMmDd}T23:59:59.999`);
  return d;
}

export function matchesFilters(
  incident: Incident,
  filters: IncidentFilters,
  dateField: "capturedAtIso" | "extinguishedAtIso",
  decidedByField: "dismissedBy" | "extinguishedBy"
): boolean {
  if (filters.location.trim() && !incident.place.toLowerCase().includes(filters.location.trim().toLowerCase())) {
    return false;
  }
  if (filters.lat.trim() && !incident.coords.lat.toFixed(4).includes(filters.lat.trim())) {
    return false;
  }
  if (filters.lng.trim() && !incident.coords.lng.toFixed(4).includes(filters.lng.trim())) {
    return false;
  }
  if (filters.severities.length > 0) {
    const key = severityKey(incident);
    if (!key || !filters.severities.includes(key)) return false;
  }
  if (filters.sources.length > 0 && !filters.sources.includes(incident.source)) {
    return false;
  }
  if (filters.dateFrom || filters.dateTo) {
    const iso = incident[dateField];
    if (!iso) return false;
    const when = new Date(iso);
    if (filters.dateFrom && when < startOfDay(filters.dateFrom)) return false;
    if (filters.dateTo && when > endOfDay(filters.dateTo)) return false;
  }
  if (filters.decidedBy.trim()) {
    const who = incident[decidedByField] ?? "";
    if (!who.toLowerCase().includes(filters.decidedBy.trim().toLowerCase())) return false;
  }
  return true;
}
