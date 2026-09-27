"use client";

import type { Incident } from "@/lib/types";
import { SeverityDot } from "@/components/primitives/SeverityDot";
import { SourceChip } from "@/components/primitives/SourceChip";
import { Button } from "@/components/primitives/Button";
import { relativeTime } from "@/lib/utils/time";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { useRelocatedPulse } from "@/lib/hooks/useRelocatedPulse";

export function ArchiveRow({ incident, tick }: { incident: Incident; tick: number }) {
  const restoreFromArchive = useIncidentStore((s) => s.restoreFromArchive);
  const { ref, pulsing } = useRelocatedPulse<HTMLDivElement>(incident.id);

  return (
    <div ref={ref} role="row" className={`data-table__row${pulsing ? " row-pulse" : ""}`}>
      <div role="cell" className="dt-id" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <SeverityDot band={incident.dispatch === "archived" ? incident.band : "not_a_fire"} size={26} />
        <span className="data" style={{ font: "600 var(--text-xs)/1 var(--font-plex-mono)", color: "var(--fg-2)" }}>
          {incident.ref}
        </span>
      </div>
      <div role="cell" className="dt-main" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ font: "600 var(--text-sm)/1.35 var(--font-plex-sans)", color: "var(--fg)" }}>{incident.place}</span>
        <span className="data" style={{ font: "400 var(--text-2xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}>
          {incident.coords.lat.toFixed(2)}, {incident.coords.lng.toFixed(2)} · conf {incident.confidence?.toFixed(2) ?? "–"}
        </span>
      </div>
      <div role="cell" className="dt-field" data-label="Source">
        <SourceChip source={incident.source} />
      </div>
      <span role="cell" className="dt-field" data-label="Captured" style={{ font: "400 var(--text-sm)/1.4 var(--font-plex-sans)", color: "var(--fg-2)" }}>
        {relativeTime(incident.capturedAtIso, tick)}
      </span>
      <span role="cell" className="dt-field dt-field--wide" data-label="Why archived" style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg-2)" }}>
        {incident.dismissedReason ?? "–"}
      </span>
      <div role="cell" className="dt-field" data-label="Decided by" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "500 var(--text-sm)/1.35 var(--font-plex-sans)", color: "var(--fg-2)" }}>{incident.dismissedBy ?? "–"}</span>
        <span className="caption" style={{ fontSize: 12 }}>
          {incident.dismissedAtIso ? relativeTime(incident.dismissedAtIso, tick) : ""}
        </span>
      </div>
      <div role="cell" className="dt-actions" style={{ justifySelf: "end" }}>
        <Button variant="pending" small ack onClick={() => restoreFromArchive(incident.id)}>
          Restore
        </Button>
      </div>
    </div>
  );
}
