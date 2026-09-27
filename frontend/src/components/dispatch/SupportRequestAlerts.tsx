"use client";

import Link from "next/link";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { relativeTime } from "@/lib/utils/time";
import { crewAsk } from "@/lib/constants/crews";
import { Button } from "@/components/primitives/Button";

/** Open requests for more help from crews on scene. Dispatching another crew to the incident
 * answers one (the backend marks it fulfilled); Dismiss clears it without sending anyone. */
export function SupportRequestAlerts() {
  const requests = useIncidentStore((s) => s.supportRequests);
  const incidents = useIncidentStore((s) => s.incidents);
  const tick = useIncidentStore((s) => s.clockTick);
  const openCrewPicker = useIncidentStore((s) => s.openCrewPicker);
  const dismiss = useIncidentStore((s) => s.dismissSupportRequest);

  return (
    <>
      {requests.map((r) => {
        const incident = incidents[r.incidentId];
        return (
          <div key={r.id} className="card card--pending" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-3)" }}>
              <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>
                Support requested{incident ? ` · ${incident.place}` : ""}
              </span>
              <span className="caption" style={{ whiteSpace: "nowrap" }}>
                {relativeTime(r.createdAtIso, tick)}
              </span>
            </div>
            <p style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg-2)" }}>
              {r.crewLabel} asks for {crewAsk(r.crewType)}.
              {r.note ? ` “${r.note}”` : ""}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: 4 }}>
              <Button variant="primary" small onClick={() => openCrewPicker(r.incidentId)}>
                Dispatch crew
              </Button>
              <Button small onClick={() => dismiss(r.id)}>
                Dismiss
              </Button>
              {incident ? (
                <Link href={`/incident/${incident.id}`} className="btn btn--link btn--sm" style={{ alignSelf: "center" }}>
                  Open {incident.ref}
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
