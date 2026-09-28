"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { reviewQueue } from "@/lib/store/selectors";
import { ReviewQueueRail } from "@/components/review/ReviewQueueRail";
import { ReviewPane } from "@/components/review/ReviewPane";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants/severity";

export default function ManualReviewPage() {
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const selectedId = useIncidentStore((s) => s.reviewSelectedId);
  const selectReview = useIncidentStore((s) => s.selectReview);

  const queue = reviewQueue(incidents, order);
  const selected = selectedId ? incidents[selectedId] : queue[0];

  useEffect(() => {
    if (!selectedId && queue.length > 0) selectReview(queue[0].id);
  }, [selectedId, queue, selectReview]);

  return (
    // queue beside the pane, or a sideways strip above it on narrow portrait screens (layout.css)
    <div className="review-layout">
      <ReviewQueueRail />
      {selected ? (
        <ReviewPane incident={selected} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6)" }}>
          <div className="card" style={{ maxWidth: 480, padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: "var(--radius-md)",
                background: "var(--ok-soft)",
                color: "var(--ok-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 18px/1 var(--font-plex-sans)",
              }}
            >
              ✓
            </span>
            <h1 style={{ font: "700 var(--text-lg)/1.25 var(--font-plex-sans)", letterSpacing: "var(--tracking-tight)", color: "var(--fg)" }}>
              Nothing awaiting review
            </h1>
            <p style={{ font: "400 var(--text-sm)/var(--lh-body) var(--font-plex-sans)", color: "var(--fg-4)" }}>
              Every current detection cleared the {CONFIDENCE_THRESHOLD} confidence threshold. Anything at or below it
              comes here instead of being forced into a severity level.
            </p>
            <Link href="/coordinator/dispatch" className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start", marginTop: 4 }}>
              Go to dispatch order
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
