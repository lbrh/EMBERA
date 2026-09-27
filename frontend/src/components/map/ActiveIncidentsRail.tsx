"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useIncidentStore, type MapFilter } from "@/lib/store/useIncidentStore";
import { filteredIncidents, reviewQueue } from "@/lib/store/selectors";
import { RankedIncidentRow } from "@/components/map/RankedIncidentRow";
import { GroupingProposalCard } from "@/components/map/GroupingProposalCard";
import { SupportRequestAlerts } from "@/components/dispatch/SupportRequestAlerts";
import { Button } from "@/components/primitives/Button";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants/severity";

const FILTERS: { key: MapFilter; label: string; empty: string }[] = [
  { key: "all", label: "All", empty: "No incidents on the map right now." },
  { key: "active", label: "Active", empty: "No incidents are waiting for a crew." },
  { key: "dispatched", label: "Dispatched", empty: "No crews are out right now." },
  { key: "extinguished", label: "Extinguished", empty: "Nothing has been extinguished yet." },
];

export function ActiveIncidentsRail({ width }: { width: number }) {
  const router = useRouter();
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const mapFilter = useIncidentStore((s) => s.mapFilter);
  const setMapFilter = useIncidentStore((s) => s.setMapFilter);
  const alertsPanelOpen = useIncidentStore((s) => s.alertsPanelOpen);
  const setAlertsPanelOpen = useIncidentStore((s) => s.setAlertsPanelOpen);
  const group = useIncidentStore((s) => s.group);
  const supportCount = useIncidentStore((s) => s.supportRequests.length);

  const ranked = filteredIncidents(incidents, order, mapFilter);
  const flaggedCount = reviewQueue(incidents, order).length;
  const suggestionCount = (group && group.state === "suggested" ? 1 : 0) + supportCount;

  return (
    <aside
      aria-label={alertsPanelOpen ? "Alerts and suggestions" : "Active incidents"}
      className="incident-rail"
      style={{
        "--rail-w": `${width}px`, // width limits and the stacked layout live in layout.css
        display: "flex",
        flexDirection: "column",
        background: "var(--panel)",
        overflow: "hidden",
      } as CSSProperties}
    >
      <div className="rail-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2
              style={{
                font: "700 var(--text-lg)/1.2 var(--font-plex-sans)",
                letterSpacing: "var(--tracking-tight)",
                color: "var(--fg)",
              }}
            >
              {alertsPanelOpen ? "Alerts and suggestions" : "Active incidents"}
            </h2>
            <p className="caption rail-head__caption">
              {alertsPanelOpen
                ? "System suggestions that need your call. Incidents are hidden."
                : "Ranked by severity."}
            </p>
          </div>
          <Button
            variant={alertsPanelOpen ? "secondary" : "pending"}
            small
            aria-pressed={alertsPanelOpen}
            onClick={() => setAlertsPanelOpen(!alertsPanelOpen)}
          >
            {alertsPanelOpen ? "Show incidents" : `Alerts${suggestionCount ? ` (${suggestionCount})` : ""}`}
          </Button>
        </div>

        {!alertsPanelOpen ? (
          <div className="seg" role="group" aria-label="Filter incidents" style={{ alignSelf: "flex-start" }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className="seg__btn"
                aria-pressed={mapFilter === f.key}
                onClick={() => setMapFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ flex: 1, overflow: "auto", borderTop: "1px solid var(--border)" }}>
        {alertsPanelOpen ? (
          <div style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            <SupportRequestAlerts />
            <GroupingProposalCard />
            {flaggedCount > 0 ? (
              <div className="card card--pending" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>
                    Manual review
                  </span>
                  <span className="caption">{flaggedCount} waiting</span>
                </div>
                <p className="caption">
                  Detections at or below the {CONFIDENCE_THRESHOLD} confidence threshold need a
                  coordinator&apos;s call before they can be dispatched.
                </p>
                <Button variant="secondary" small style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => router.push("/review")}>
                  Open review queue
                </Button>
              </div>
            ) : null}
            {!group && flaggedCount === 0 && supportCount === 0 ? (
              <p className="caption">No alerts or suggestions right now.</p>
            ) : null}
          </div>
        ) : ranked.length === 0 ? (
          <p className="caption" style={{ padding: "var(--space-5)" }}>
            {FILTERS.find((f) => f.key === mapFilter)?.empty}
          </p>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ranked.map((incident) => (
              <li key={incident.id}>
                <RankedIncidentRow incident={incident} />
              </li>
            ))}
          </ol>
        )}
      </div>

      {!alertsPanelOpen && flaggedCount > 0 ? (
        <button
          type="button"
          className="row-btn"
          onClick={() => router.push("/review")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-4) var(--space-5)",
            background: "var(--grad-pending)",
            borderTop: "1px dashed var(--accent-border)",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "2px dashed var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "700 12px/1 var(--font-plex-sans)",
              color: "var(--accent)",
              flex: "none",
            }}
          >
            ?
          </span>
          <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--accent-fg)" }}>
            {flaggedCount} {flaggedCount === 1 ? "incident needs" : "incidents need"} manual review
          </span>
          <span aria-hidden style={{ marginLeft: "auto", color: "var(--accent)" }}>
            ›
          </span>
        </button>
      ) : null}
    </aside>
  );
}
