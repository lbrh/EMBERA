"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Incident } from "@/lib/types";
import { SeverityDot } from "@/components/primitives/SeverityDot";
import { SeverityChip } from "@/components/primitives/SeverityChip";
import { SourceChip } from "@/components/primitives/SourceChip";
import { StatusFlagChip } from "@/components/primitives/StatusFlagChip";
import { confidenceColor } from "@/components/primitives/ConfidenceMeter";
import { relativeTime } from "@/lib/utils/time";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { dataSource } from "@/lib/data-source";

/** One incident in the map page's list. The list is a size container (.incident-rail in
 * map.css): as it's dragged wider, the detail line and then a thumbnail appear. */
export function RankedIncidentRow({ incident }: { incident: Incident }) {
  const router = useRouter();
  const tick = useIncidentStore((s) => s.clockTick);
  const newIncidentId = useIncidentStore((s) => s.newIncidentId);
  const hovered = useIncidentStore((s) => s.mapHoverId === incident.id);
  const setMapHoverId = useIncidentStore((s) => s.setMapHoverId);
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbFailed ? null : dataSource.getImagePreviewUrl(incident.file, 240);
  const { smoke, flame, vegetation, infrastructure } = incident.elements;

  return (
    <button
      type="button"
      className="row-btn rail-row"
      onClick={() => router.push(`/incident/${incident.id}`)}
      // highlights this incident's marker on the map (and vice versa)
      onMouseEnter={() => setMapHoverId(incident.id)}
      onMouseLeave={() => setMapHoverId(null)}
      onFocus={() => setMapHoverId(incident.id)}
      onBlur={() => setMapHoverId(null)}
      style={{
        background: hovered ? "var(--accent-soft)" : incident.id === newIncidentId ? "var(--tint)" : undefined,
        boxShadow: hovered ? "inset 3px 0 0 var(--accent)" : "none",
      }}
    >
      {thumb ? (
        // lazy + display:none below the wide breakpoint, so narrow lists never download these
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="rail-row__thumb"
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setThumbFailed(true)} // row falls back to the no-thumbnail layout
        />
      ) : null}
      <SeverityDot band={incident.band} size={32} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
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
          <span style={{ display: "flex", gap: "var(--space-1)", flex: "none" }}>
            {incident.dispatch !== "awaiting" ? <StatusFlagChip flag={incident.flag} dispatch={incident.dispatch} /> : null}
            <SeverityChip band={incident.band} />
          </span>
        </div>
        <div
          className="data"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            font: "400 var(--text-2xs)/1 var(--font-plex-mono)",
            color: "var(--muted)",
          }}
        >
          <span className="rail-row__id">{incident.ref}</span>
          <span aria-hidden>·</span>
          <span style={{ flex: "none" }}>{relativeTime(incident.capturedAtIso, tick)}</span>
          <span aria-hidden>·</span>
          <span style={{ flex: "none", color: incident.confidence ? confidenceColor(incident.confidence) : undefined, fontWeight: 600 }}>
            conf {incident.confidence?.toFixed(2) ?? "–"}
          </span>
          <span style={{ marginLeft: "auto" }}>
            <SourceChip source={incident.source} />
          </span>
        </div>
        <div className="rail-row__detail">
          {incident.explanation ? <p className="rail-row__explanation">{incident.explanation}</p> : null}
          {smoke != null ? (
            <span className="data">
              smoke {smoke} · flame {flame} · vegetation {vegetation} · infrastructure {infrastructure}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
