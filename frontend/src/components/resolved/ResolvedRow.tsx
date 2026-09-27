"use client";

import Link from "next/link";
import type { Incident } from "@/lib/types";
import { SeverityDot } from "@/components/primitives/SeverityDot";
import { SeverityChip } from "@/components/primitives/SeverityChip";
import { SOURCE_META } from "@/components/primitives/SourceChip";
import { Button } from "@/components/primitives/Button";
import { formatClock } from "@/lib/utils/time";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { useRelocatedPulse } from "@/lib/hooks/useRelocatedPulse";

export function ResolvedRow({ incident }: { incident: Incident }) {
  const reopenIncident = useIncidentStore((s) => s.reopenIncident);
  const archiveIncident = useIncidentStore((s) => s.archiveIncident);
  const { ref, pulsing } = useRelocatedPulse<HTMLDivElement>(incident.id);

  return (
    <div ref={ref} role="row" className={`data-table__row${pulsing ? " row-pulse" : ""}`}>
      <div role="cell" className="dt-id">
        <Link
          href={`/incident/${incident.id}`}
          className="btn btn--link data"
          style={{ fontFamily: "var(--font-plex-mono)", fontSize: "var(--text-xs)" }}
        >
          {incident.ref}
        </Link>
      </div>
      <div role="cell" className="dt-main" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ font: "600 var(--text-sm)/1.35 var(--font-plex-sans)", color: "var(--fg)" }}>{incident.place}</span>
        <span className="data" style={{ font: "400 var(--text-2xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}>
          {incident.coords.lat.toFixed(2)}, {incident.coords.lng.toFixed(2)} · {SOURCE_META[incident.source].abbr}
        </span>
      </div>
      <div role="cell" className="dt-field" data-label="Peak severity" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", opacity: 0.8 }}>
        <SeverityDot band={incident.band} size={24} />
        <SeverityChip band={incident.band} />
      </div>
      <span role="cell" className="dt-field" data-label="Dispatched" style={{ font: "400 var(--text-sm)/1.4 var(--font-plex-sans)", color: "var(--fg-2)" }}>
        This shift
      </span>
      <span role="cell" className="dt-field dt-field--wide" data-label="Extinguished" style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg-2)" }}>
        <span className="data" style={{ fontFamily: "var(--font-plex-mono)", fontSize: "var(--text-xs)" }}>
          {incident.extinguishedAtIso ? `${formatClock(incident.extinguishedAtIso)} AEST` : "–"}
        </span>
        {incident.extinguishedNote ? `. ${incident.extinguishedNote}` : ""}
      </span>
      <span role="cell" className="dt-field" data-label="Reported by" style={{ font: "500 var(--text-sm)/1.35 var(--font-plex-sans)", color: "var(--fg-2)" }}>
        {incident.extinguishedBy ?? "–"}
      </span>
      <div role="cell" className="dt-actions" style={{ justifySelf: "end", display: "flex", gap: "var(--space-2)" }}>
        <Button variant="pending" small ack onClick={() => reopenIncident(incident.id)}>
          Reopen
        </Button>
        <Button variant="secondary" small ack onClick={() => archiveIncident(incident.id)}>
          Archive
        </Button>
      </div>
    </div>
  );
}
