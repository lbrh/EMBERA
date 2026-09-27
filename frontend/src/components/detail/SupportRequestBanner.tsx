"use client";

import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { relativeTime } from "@/lib/utils/time";
import { crewAsk } from "@/lib/constants/crews";
import { HatchBanner } from "@/components/primitives/HatchBanner";
import { Button } from "@/components/primitives/Button";
import type { SupportRequest } from "@/lib/types";

const EMPTY: SupportRequest[] = [];

/** Open requests for more help on this incident, at the top of the page: who is asking, for what,
 * their note, and the two ways to answer. It disappears once another crew is sent or it's dismissed. */
export function SupportRequestBanner({ incidentId }: { incidentId: string }) {
  const requests = useIncidentStore((s) => s.supportRequests);
  const tick = useIncidentStore((s) => s.clockTick);
  const openCrewPicker = useIncidentStore((s) => s.openCrewPicker);
  const dismiss = useIncidentStore((s) => s.dismissSupportRequest);
  const mine = requests.length ? requests.filter((r) => r.incidentId === incidentId) : EMPTY;
  if (mine.length === 0) return null;

  return (
    // role="alert": announced when it appears, e.g. when a poll brings in a new request
    <div role="alert">
      {mine.map((r) => (
        <HatchBanner key={r.id} className="support-banner">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: "1 1 320px", minWidth: 0 }}>
            <span className="label" style={{ color: "var(--accent-fg)" }}>
              Support requested · {relativeTime(r.createdAtIso, tick)}
            </span>
            <p style={{ font: "700 var(--text-lg)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>
              {r.crewLabel} needs {crewAsk(r.crewType)}
            </p>
            {r.note ? (
              <blockquote className="support-banner__note">{r.note}</blockquote>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignSelf: "center" }}>
            <Button variant="primary" onClick={() => openCrewPicker(incidentId)}>
              Dispatch crew
            </Button>
            <Button onClick={() => dismiss(r.id)}>Dismiss</Button>
          </div>
        </HatchBanner>
      ))}
    </div>
  );
}
