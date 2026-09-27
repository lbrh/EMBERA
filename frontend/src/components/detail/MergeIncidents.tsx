"use client";

import { useState } from "react";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { mergeCandidates } from "@/lib/store/selectors";
import { relativeTime } from "@/lib/utils/time";
import { Button } from "@/components/primitives/Button";
import { SectionHeading } from "@/components/primitives/Card";
import { SeverityDot } from "@/components/primitives/SeverityDot";
import type { Incident } from "@/lib/types";

const MAX_KM = 15;

/** Open incidents close to this one that may be the same fire, each mergeable into this incident.
 * Two clicks (merge, then confirm), since a merge moves everything across and there's no undo:
 * splitting an image back out doesn't bring back the other incident's crews and history. */
export function MergeIncidents({ incident }: { incident: Incident }) {
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const tick = useIncidentStore((s) => s.clockTick);
  const mergeIncidents = useIncidentStore((s) => s.mergeIncidents);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = incident.dispatch === "awaiting" || incident.dispatch === "live" || incident.dispatch === "unranked";
  const candidates = open ? mergeCandidates(incidents, order, incident.id, MAX_KM) : [];
  if (candidates.length === 0) return null;

  async function merge(sourceId: string) {
    setBusy(true);
    await mergeIncidents(sourceId, incident.id);
    setBusy(false);
    setArmed(null);
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <SectionHeading
        as="h2"
        note={`Open incidents within ${MAX_KM} km. Merging moves the other incident's images, crews, comments and history into this one.`}
      >
        Same fire?
      </SectionHeading>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {candidates.map(({ incident: other, km }) => (
          <li
            key={other.id}
            className="card"
            style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", flexWrap: "wrap" }}
          >
            <SeverityDot band={other.flag === "flagged_review" ? 0 : other.band} size={24} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 160px", minWidth: 0 }}>
              <span style={{ font: "600 var(--text-sm)/1.25 var(--font-plex-sans)", color: "var(--fg)" }}>{other.place}</span>
              <span className="data" style={{ font: "400 var(--text-2xs)/1.3 var(--font-plex-mono)", color: "var(--muted)" }}>
                {other.ref} · {km.toFixed(1)} km away · latest image {relativeTime(other.capturedAtIso, tick)}
              </span>
            </span>
            {armed === other.id ? (
              <span style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button variant="primary" small disabled={busy} onClick={() => merge(other.id)}>
                  Confirm merge
                </Button>
                <Button variant="secondary" small disabled={busy} onClick={() => setArmed(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button variant="secondary" small onClick={() => setArmed(other.id)} aria-label={`Merge ${other.ref} into this incident`}>
                Merge into this incident
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
