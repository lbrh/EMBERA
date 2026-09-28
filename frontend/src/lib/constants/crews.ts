import type { AssignmentStatus, CrewType } from "@/lib/types";

export const CREW_TYPE_LABEL: Record<CrewType, string> = { light: "Light", heavy: "Heavy", aerial: "Aerial" };

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  dispatched: "Dispatched",
  en_route: "En route",
  on_scene: "On scene",
  cleared: "Cleared",
};

/** What a support request asks for, as words: "an aerial crew", "a heavy crew", "another crew". */
export function crewAsk(type: CrewType | null): string {
  if (!type) return "another crew";
  return `${type === "aerial" ? "an" : "a"} ${type} crew`;
}
