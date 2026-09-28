"use client";

import { useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { relativeTime } from "@/lib/utils/time";
import { backLabelForPath } from "@/lib/constants/nav";
import { SeverityHeader } from "@/components/detail/SeverityHeader";
import { DetailActionsBar } from "@/components/detail/DetailActionsBar";
import { OverrideSeverityCard } from "@/components/detail/OverrideSeverityCard";
import { HowScoredExplainer } from "@/components/detail/HowScoredExplainer";
import { NearbyStrip } from "@/components/detail/NearbyStrip";
import { MergeIncidents } from "@/components/detail/MergeIncidents";
import { IncidentGallery } from "@/components/detail/IncidentGallery";
import { ActivityFeed } from "@/components/detail/ActivityFeed";
import { AssignedCrews } from "@/components/dispatch/AssignedCrews";
import { SupportRequestBanner } from "@/components/detail/SupportRequestBanner";
import { MetaList } from "@/components/primitives/MetaField";
import { SectionHeading } from "@/components/primitives/Card";
import type { DecisionLogEntry, IncidentComment } from "@/lib/types";
import { usePoll } from "@/lib/hooks/usePoll";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants/severity";

// Stable reference so the Zustand selector below doesn't return a new array every render
// (a fresh `[]` fallback on every call makes useSyncExternalStore think the snapshot changed
// on every render, which is an infinite loop, not just a wasted render).
const EMPTY_LOGS: DecisionLogEntry[] = [];
const EMPTY_COMMENTS: IncidentComment[] = [];

export default function IncidentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const incident = useIncidentStore((s) => s.incidents[id]);
  const decisionLogs = useIncidentStore((s) => s.decisionLogs[id] ?? EMPTY_LOGS);
  const loadDecisionLog = useIncidentStore((s) => s.loadDecisionLog);
  const comments = useIncidentStore((s) => s.comments[id] ?? EMPTY_COMMENTS);
  const loadComments = useIncidentStore((s) => s.loadComments);
  // Refetch the server's log whenever this incident's server-side state changes (i.e. after a decision).
  const backendState = incident?.backend;
  useEffect(() => {
    loadDecisionLog(id);
  }, [id, backendState, loadDecisionLog]);
  // Comments and decisions from other screens (crews, other coordinators) arrive by polling.
  const loadActivity = useCallback(() => {
    loadDecisionLog(id);
    loadComments(id);
  }, [id, loadDecisionLog, loadComments]);
  useEffect(() => {
    loadComments(id);
  }, [id, loadComments]);
  usePoll(loadActivity);
  const tick = useIncidentStore((s) => s.clockTick);
  const lastTabPath = useIncidentStore((s) => s.lastTabPath);

  if (!incident) {
    return (
      <div style={{ padding: "var(--space-8) var(--space-5)", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)" }}>
        <p style={{ font: "600 var(--text-base)/1.4 var(--font-plex-sans)", color: "var(--fg)" }}>Incident {id} not found</p>
        <p className="caption">Check the ID, or go back and open it from the list.</p>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => router.push(lastTabPath)}>
          {backLabelForPath(lastTabPath)}
        </button>
      </div>
    );
  }

  const priorityLabel =
    incident.dispatch === "live"
      ? "live · crew dispatched"
      : incident.dispatch === "extinguished" || incident.dispatch === "archived"
        ? "resolved · not ranked"
        : incident.band === 0
          ? "not ranked until reviewed"
          : "ranked in dispatch order";

  const classificationLabel =
    incident.flag === "not_a_fire"
      ? "Non-Fire"
      : incident.dispatch === "extinguished" || incident.dispatch === "archived"
        ? "Extinguished"
        : incident.band === 0
          ? "Uncertain"
          : "Fire";

  const record = [
    `sev=${incident.band || "null"}`,
    `smoke=${incident.elements.smoke ?? "null"}`,
    `flame=${incident.elements.flame ?? "null"}`,
    `veg=${incident.elements.vegetation ?? "null"}`,
    `infra=${incident.elements.infrastructure ?? "null"}`,
    `sum=${incident.sum ?? "null"}`,
    `conf=${incident.confidence ?? "null"}`,
    `thr=${CONFIDENCE_THRESHOLD}`,
    `lat/lng=${incident.coords.lat.toFixed(4)},${incident.coords.lng.toFixed(4)}`,
    `t=${incident.capturedAtIso}`,
    `flag=${incident.flag}`,
    `label=${classificationLabel.toLowerCase()}`,
    `priority=${priorityLabel}`,
    `group=${incident.groupId ?? "none"}`,
    `src=${incident.source}`,
  ].join(" ");

  return (
    <div className="page" style={{ maxWidth: 1200, paddingTop: "var(--space-5)" }}>
      <button
        type="button"
        className="btn btn--link"
        onClick={() => router.push(lastTabPath)}
        style={{ marginBottom: "var(--space-4)", fontSize: "var(--text-xs)" }}
      >
        <span aria-hidden>‹</span> {backLabelForPath(lastTabPath)}
      </button>

      <article className="card" style={{ overflow: "hidden" }}>
        <SeverityHeader incident={incident} />
        <SupportRequestBanner incidentId={incident.id} />

        {/* Two columns on desktop. Below 1024px the columns dissolve (layout.css) so the actions lead,
            image and metadata follow, and the exportable record goes last. */}
        <div className="detail-grid">
          <div className="detail-col" style={{ gap: "var(--space-4)" }}>
            <div className="d-image">
              <IncidentGallery incident={incident} />
            </div>
            <div className="d-meta">
            <MetaList
              rows={[
                { label: "Location", value: incident.place },
                { label: "Captured", value: relativeTime(incident.capturedAtIso, tick) },
                { label: "Class", value: classificationLabel },
                { label: "Priority", value: priorityLabel },
                { label: "Group", value: incident.groupId ?? "None", mono: !!incident.groupId },
              ]}
            />
            </div>
            <details className="card card--inset d-record" style={{ padding: "var(--space-3) var(--space-4)" }}>
              <summary className="label" style={{ cursor: "pointer" }}>
                Exportable record
              </summary>
              <p
                className="data"
                style={{
                  marginTop: "var(--space-2)",
                  font: "400 var(--text-2xs)/1.7 var(--font-plex-mono)",
                  color: "var(--fg-4)",
                  wordBreak: "break-word",
                }}
              >
                {record}
              </p>
            </details>
          </div>

          <div className="detail-col" style={{ gap: "var(--space-5)" }}>
            <DetailActionsBar incident={incident} />

            {incident.dispatch === "live" ? (
              <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <SectionHeading as="h2" note="Recall a crew with ✕. Recalling the last one puts the fire back in the dispatch order.">
                  Crews
                </SectionHeading>
                <AssignedCrews incidentId={incident.id} showAdd />
              </section>
            ) : null}

            {incident.recommendedAction ? (
              <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <SectionHeading as="h2">Recommended action</SectionHeading>
                <p
                  style={{
                    font: "500 var(--text-lg)/1.45 var(--font-plex-sans)",
                    letterSpacing: "-0.01em",
                    color: "var(--fg)",
                    maxWidth: "60ch",
                  }}
                >
                  {incident.recommendedAction}
                </p>
              </section>
            ) : null}

            {incident.explanation ? (
              <section className="card card--inset" style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <SectionHeading as="h2" note="Read-only explanation from the assessment.">
                  Why this severity
                </SectionHeading>
                <p style={{ font: "400 var(--text-base)/var(--lh-body) var(--font-plex-sans)", color: "var(--fg-2)", maxWidth: "70ch" }}>
                  {incident.explanation}
                </p>
                {incident.reasonBullets.length > 0 ? (
                  <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", listStyle: "none", margin: 0, padding: 0 }}>
                    {incident.reasonBullets.map((b) => (
                      <li key={b} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                        <span
                          aria-hidden
                          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 8, flex: "none" }}
                        />
                        <span style={{ font: "400 var(--text-sm)/var(--lh-body) var(--font-plex-sans)", color: "var(--fg-2)" }}>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <span className="data" style={{ font: "400 var(--text-2xs)/1.4 var(--font-plex-mono)", color: "var(--muted)" }}>
                  conf {incident.confidence?.toFixed(2) ?? "–"} · assessed {relativeTime(incident.capturedAtIso, tick)} ·{" "}
                  {incident.provenance.replace(/_/g, " ")}
                </span>
              </section>
            ) : null}

            <OverrideSeverityCard incident={incident} />

            <MergeIncidents incident={incident} />

            <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <SectionHeading as="h2" note="Comments and decisions, newest first, with who and when.">
                Activity
              </SectionHeading>
              <ActivityFeed incidentId={incident.id} decisions={decisionLogs} comments={comments} />
            </section>

            <HowScoredExplainer incident={incident} />
          </div>
        </div>

        <NearbyStrip currentId={incident.id} />
      </article>
    </div>
  );
}
