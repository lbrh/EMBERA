"use client";

import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { reviewQueue } from "@/lib/store/selectors";
import { HatchBanner } from "@/components/primitives/HatchBanner";
import { ReviewQueueItem } from "@/components/review/ReviewQueueItem";
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
            style={{ color: "var(--on-primary)", background: "var(--primary)", fontFamily: "var(--font-plex-mono)" }}
          >
            {queue.length}
          </span>
        </div>
        <p className="caption review-queue__caption" style={{ marginTop: 4 }}>
          Held out of the ranking until you decide.
        </p>
      </HatchBanner>

      <ul className="review-queue__list">
        {queue.map((incident) => (
          <ReviewQueueItem
            key={incident.id}
            incident={incident}
            selected={incident.id === selectedId}
            tick={tick}
            onSelect={() => selectReview(incident.id)}
          />
        ))}
      </ul>
    </aside>
  );
}
