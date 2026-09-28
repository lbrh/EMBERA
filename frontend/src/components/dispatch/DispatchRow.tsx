"use client";

import { useRouter } from "next/navigation";
import type { Incident } from "@/lib/types";
import { SeverityDot } from "@/components/primitives/SeverityDot";
import { SeverityChip } from "@/components/primitives/SeverityChip";
import { confidenceColor } from "@/components/primitives/ConfidenceMeter";
import { Button } from "@/components/primitives/Button";
import { relativeTime } from "@/lib/utils/time";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { SOURCE_META } from "@/components/primitives/SourceChip";
import { useRelocatedPulse } from "@/lib/hooks/useRelocatedPulse";
import { AssignedCrews } from "@/components/dispatch/AssignedCrews";

export function DispatchRow({ incident, rank }: { incident: Incident; rank: number | null }) {
  const router = useRouter();
  const tick = useIncidentStore((s) => s.clockTick);
  const openCrewPicker = useIncidentStore((s) => s.openCrewPicker);
  const isLive = incident.dispatch === "live";
  const isNext = rank === 1;
  const { ref, pulsing } = useRelocatedPulse<HTMLDivElement>(incident.id);

  return (
    <div
      ref={ref}
      role="link"
      tabIndex={0}
      aria-label={`${rank ? `Rank ${rank}, ` : "Live, "}${incident.place}, open incident`}
      // a table row on desktop, a card below 1024px (.dispatch-row in layout.css)
      className={`row-btn dispatch-grid dispatch-row${pulsing ? " row-pulse" : ""}`}
      onClick={() => router.push(`/incident/${incident.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(`/incident/${incident.id}`);
      }}
      style={{
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        background: isNext ? "var(--grad-pending)" : undefined,
      }}
    >
      {isLive ? (
        <span className="dr-rank">
          <span className="chip chip--pill" style={{ color: "var(--ok-fg)", background: "var(--ok-soft)", borderColor: "var(--ok-border)" }}>
            Live
          </span>
        </span>
      ) : (
        <span
          className="data dr-rank"
          style={{
            font: "700 var(--text-xl)/1 var(--font-plex-mono)",
            letterSpacing: "var(--tracking-tight)",
            color: isNext ? "var(--accent)" : "var(--fg)",
          }}
        >
          {rank ?? "–"}
        </span>
      )}
      <div className="dr-sev" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <SeverityDot band={incident.band} size={30} />
        <SeverityChip band={incident.band} short />
      </div>
      <div className="dr-main" style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span
          style={{
            font: "600 var(--text-sm)/1.3 var(--font-plex-sans)",
            color: "var(--fg)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {incident.place}
        </span>
        <span className="data" style={{ font: "400 var(--text-2xs)/1.3 var(--font-plex-mono)", color: "var(--muted)" }}>
          {incident.ref} · {incident.coords.lat.toFixed(2)}, {incident.coords.lng.toFixed(2)} · {SOURCE_META[incident.source].abbr}
        </span>
        <span className="caption" style={{ fontSize: 12 }}>
          Captured {relativeTime(incident.capturedAtIso, tick)}
        </span>
      </div>
      <span className="dr-reason" style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg-2)" }}>
        {isLive ? (
          <AssignedCrews incidentId={incident.id} />
        ) : (
          incident.recommendedAction ?? "Ranked by severity."
        )}
      </span>
      <div className="dr-metrics">
        <span
          className="data dr-conf"
          style={{
            font: "600 var(--text-sm)/1 var(--font-plex-mono)",
            color: incident.confidence ? confidenceColor(incident.confidence) : "var(--muted)",
          }}
        >
          {incident.confidence?.toFixed(2) ?? "–"}
        </span>
      </div>
      <div className="dr-action" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ justifySelf: "end" }}>
        {/* only crews close a fire (Crew tab); the coordinator can send more help */}
        {isLive ? (
          <Button variant="secondary" small onClick={() => openCrewPicker(incident.id)}>
            Add crew
          </Button>
        ) : (
          <Button variant={isNext ? "primary" : "secondary"} small onClick={() => openCrewPicker(incident.id)}>
            Dispatch crew
          </Button>
        )}
      </div>
    </div>
  );
}
