"use client";

import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { reviewQueue } from "@/lib/store/selectors";
import { relativeTime } from "@/lib/utils/time";
import { HatchBanner } from "@/components/primitives/HatchBanner";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants/severity";

const REASON_LABEL: Record<string, string> = {
  below_threshold: `At or below ${CONFIDENCE_THRESHOLD}`,
  sent_by_coordinator: "Sent by coordinator",
  restored_not_fire: "Restored, was not a fire",
  restored_discarded: "Restored, was discarded",
  no_fire_detected: "No smoke or flame seen",
};

export function ReviewQueueRail() {
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const selectedId = useIncidentStore((s) => s.reviewSelectedId);
  const selectReview = useIncidentStore((s) => s.selectReview);
  const tick = useIncidentStore((s) => s.clockTick);

  const queue = reviewQueue(incidents, order);

  return (
    <aside aria-label="Review queue" className="review-queue">
      <HatchBanner className="review-queue__head">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <h2 style={{ font: "700 var(--text-lg)/1.2 var(--font-plex-sans)", letterSpacing: "var(--tracking-tight)", color: "var(--fg)" }}>
            Review queue
          </h2>
          <span
            className="chip chip--pill data"
            style={{ color: "var(--on-primary)", background: "var(--grad-primary)", fontFamily: "var(--font-plex-mono)" }}
          >
            {queue.length}
          </span>
        </div>
        <p className="caption review-queue__caption" style={{ marginTop: 4 }}>
          Held out of the ranking until you decide.
        </p>
      </HatchBanner>

      <ul className="review-queue__list">
        {queue.map((incident) => {
          const selected = incident.id === selectedId;
          return (
            <li key={incident.id}>
              <button
                type="button"
                className="row-btn review-queue__item"
                aria-current={selected ? "true" : undefined}
                onClick={() => selectReview(incident.id)}
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
        })}
      </ul>
    </aside>
  );
}
