"use client";

import { useRouter } from "next/navigation";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { Button } from "@/components/primitives/Button";
import { SeverityChip } from "@/components/primitives/SeverityChip";

const STATE_LABEL = {
  suggested: "Awaiting your confirmation",
  confirmed: "Confirmed by you",
  kept_separate: "Kept separate",
} as const;

export function GroupingProposalCard() {
  const router = useRouter();
  const group = useIncidentStore((s) => s.group);
  const incidents = useIncidentStore((s) => s.incidents);
  const confirmGrouping = useIncidentStore((s) => s.confirmGrouping);
  const keepGroupSeparate = useIncidentStore((s) => s.keepGroupSeparate);

  if (!group) return null;

  const members = group.memberIds.map((id) => incidents[id]).filter(Boolean);
  const pending = group.state === "suggested";

  return (
    <div
      className={pending ? "card card--pending" : "card"}
      style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>
            Grouping suggestion
          </span>
          <span className="caption data" style={{ fontFamily: "var(--font-plex-mono)", fontSize: "var(--text-2xs)" }}>
            {group.id}
          </span>
        </div>
        <span
          className="chip chip--pill"
          style={
            pending
              ? { color: "var(--accent-fg)", background: "var(--accent-soft)", borderColor: "var(--accent-border)", borderStyle: "dashed" }
              : { color: "var(--fg-4)", background: "var(--surface-2)", borderColor: "var(--border)" }
          }
        >
          {STATE_LABEL[group.state]}
        </span>
      </div>
      <p style={{ font: "400 var(--text-sm)/var(--lh-body) var(--font-plex-sans)", color: "var(--fg-2)" }}>
        These detections sit within {group.proximityKm} km of each other and were captured{" "}
        {Math.round(group.windowHours * 60)} minutes apart, so the system reads them as one incident.
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => router.push(`/coordinator/incident/${m.id}`)}
            style={{ gap: 8, paddingLeft: 10, paddingRight: 6 }}
          >
            <span className="data" style={{ font: "500 var(--text-2xs)/1 var(--font-plex-mono)" }}>
              {m.ref}
            </span>
            <SeverityChip band={m.band} short />
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {group.state !== "confirmed" ? (
          <Button variant="primary" small ack onClick={confirmGrouping}>
            Confirm as one incident
          </Button>
        ) : null}
        {group.state !== "kept_separate" ? (
          <Button variant="secondary" small ack onClick={keepGroupSeparate}>
            {group.state === "confirmed" ? "Split into separate incidents" : "Keep separate"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
