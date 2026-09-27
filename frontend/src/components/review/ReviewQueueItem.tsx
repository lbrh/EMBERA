"use client";

import type { Incident } from "@/lib/types";
import { relativeTime } from "@/lib/utils/time";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants/severity";
import { useRelocatedPulse } from "@/lib/hooks/useRelocatedPulse";

const REASON_LABEL: Record<string, string> = {
  below_threshold: `At or below ${CONFIDENCE_THRESHOLD}`,
  sent_by_coordinator: "Sent by coordinator",
  restored_not_fire: "Restored, was not a fire",
  restored_discarded: "Restored, was discarded",
};

export function ReviewQueueItem({
  incident,
  selected,
  tick,
  onSelect,
}: {
  incident: Incident;
  selected: boolean;
  tick: number;
  onSelect: () => void;
}) {
  const { ref, pulsing } = useRelocatedPulse<HTMLButtonElement>(incident.id);

  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={`row-btn review-queue__item${pulsing ? " row-pulse" : ""}`}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="data" style={{ font: "500 var(--text-2xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}>
            {incident.ref}
          </span>
          <span className="data" style={{ font: "700 var(--text-xs)/1 var(--font-plex-mono)", color: "var(--accent)" }}>
            {incident.confidence?.toFixed(2)}
          </span>
        </div>
        <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>{incident.place}</span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
          <span className="caption" style={{ fontSize: 12 }}>
            {relativeTime(incident.capturedAtIso, tick)}
          </span>
          <span
            className="chip"
            style={{ color: "var(--accent-fg)", background: "var(--accent-soft)", borderColor: "var(--accent-border)", borderStyle: "dashed", fontWeight: 500 }}
          >
            {REASON_LABEL[incident.reviewReason ?? "below_threshold"]}
          </span>
        </div>
      </button>
    </li>
  );
}
