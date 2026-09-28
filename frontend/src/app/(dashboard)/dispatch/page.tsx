"use client";

import { useRouter } from "next/navigation";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { rankedAwaiting, liveDispatched, reviewQueue } from "@/lib/store/selectors";
import { DispatchRow } from "@/components/dispatch/DispatchRow";
import { Button } from "@/components/primitives/Button";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants/severity";

const FILTERS: { key: "all" | "awaiting" | "live"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting dispatch" },
  { key: "live", label: "Live" },
];

export default function DispatchOrderPage() {
  const router = useRouter();
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const dispatchFilter = useIncidentStore((s) => s.dispatchFilter);
  const setDispatchFilter = useIncidentStore((s) => s.setDispatchFilter);

  const awaiting = rankedAwaiting(incidents, order);
  const live = liveDispatched(incidents, order);
  const flaggedCount = reviewQueue(incidents, order).length;

  const showAwaiting = dispatchFilter !== "live";
  const showLive = dispatchFilter !== "awaiting";
  const counts = { all: awaiting.length + live.length, awaiting: awaiting.length, live: live.length };

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <h1 className="page-title">Dispatch order</h1>
          <p className="page-lede">Ranked by severity. Every position states its own reason.</p>
        </div>
        <div className="seg" role="group" aria-label="Filter dispatch order">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="seg__btn"
              aria-pressed={dispatchFilter === f.key}
              onClick={() => setDispatchFilter(f.key)}
            >
              {f.label}
              <span className="seg__count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: "var(--space-5)", overflow: "hidden" }}>
        <div
          aria-hidden
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
          className="caption dispatch-grid dispatch-head"
        >
          <span>Rank</span>
          <span>Severity</span>
          <span>Incident</span>
          <span>Reason</span>
          <span>Conf.</span>
          <span />
        </div>

        {showAwaiting ? (
          <section aria-label="Awaiting dispatch">
            <SectionBar tone="accent" title="Awaiting dispatch" count={awaiting.length} />
            {awaiting.length === 0 ? (
              <EmptyRow text="Every ranked incident has a crew assigned." />
            ) : (
              awaiting.map((i, idx) => <DispatchRow key={i.id} incident={i} rank={idx + 1} />)
            )}
          </section>
        ) : null}

        {showLive ? (
          <section aria-label="Live">
            <SectionBar tone="ok" title="Live" count={live.length} note="Stays live until the crew reports the fire out." />
            <SectionBar tone="ok" title="Live" count={live.length} note="Crews mark the fire extinguished (or a false alarm) from the Crew tab." />
            {live.length === 0 ? (
              <EmptyRow text="No crews out yet. Incidents move here when you dispatch a crew." />
            ) : (
              live.map((i) => <DispatchRow key={i.id} incident={i} rank={null} />)
            )}
          </section>
        ) : null}
      </div>

      <div
        className="card card--pending"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--space-4)",
          marginTop: "var(--space-5)",
          padding: "var(--space-4) var(--space-5)",
          boxShadow: "none",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "2px dashed var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
            font: "700 13px/1 var(--font-plex-sans)",
            color: "var(--accent)",
          }}
        >
          ?
        </span>
        <p style={{ font: "400 var(--text-sm)/var(--lh-body) var(--font-plex-sans)", color: "var(--fg-2)", flex: "1 1 240px" }}>
          Detections at or below the {CONFIDENCE_THRESHOLD} confidence threshold stay out of this order until a
          reviewer confirms, changes or discards them. Not-a-fire images go to the Archive, and
          extinguished fires move to Resolved.
          {flaggedCount > 0 ? ` ${flaggedCount} waiting now.` : ""}
        </p>
        {flaggedCount > 0 ? (
          <Button variant="pending" small onClick={() => router.push("/review")}>
            Open review queue
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SectionBar({ tone, title, count, note }: { tone: "accent" | "ok"; title: string; count: number; note?: string }) {
  const color = tone === "accent" ? "var(--accent-fg)" : "var(--ok-fg)";
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "10px var(--space-5)",
        borderBottom: "1px solid var(--border)",
        background: tone === "accent" ? "var(--accent-soft)" : "var(--ok-soft)",
      }}
    >
      <h2 style={{ font: "600 var(--text-sm)/1 var(--font-plex-sans)", color }}>{title}</h2>
      <span
        className="chip chip--pill data"
        style={{ height: 20, color, background: "var(--panel)", borderColor: "currentColor", fontFamily: "var(--font-plex-mono)", fontSize: 11 }}
      >
        {count}
      </span>
      {note ? <span className="caption">{note}</span> : null}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="caption" style={{ padding: "var(--space-5)", fontSize: "var(--text-sm)" }}>
      {text}
    </p>
  );
}
