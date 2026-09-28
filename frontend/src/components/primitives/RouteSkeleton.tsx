"use client";

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";

/** One shimmering placeholder block (.skel in components.css). */
function Bone({ w = "100%", h = 12, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
  return <span className="skel" style={{ width: w, height: h, ...style }} />;
}

const column = (gap: string): CSSProperties => ({ display: "flex", flexDirection: "column", gap });

/** A list row: two text lines on the left, a chip on the right. */
function RowBones({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            padding: "var(--space-4) var(--space-5)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ ...column("var(--space-2)"), flex: 1 }}>
            <Bone w="45%" h={11} />
            <Bone w="70%" h={14} />
          </div>
          <Bone w={72} h={22} style={{ borderRadius: "var(--radius-full)" }} />
        </div>
      ))}
    </>
  );
}

/** A side rail, sized and stacked by the real rail's class (layout.css). */
function Rail({ className, side, rows }: { className: string; side: "left" | "right"; rows: number }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--panel)",
        [side === "left" ? "borderRight" : "borderLeft"]: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      <div style={{ ...column("var(--space-2)"), padding: "var(--space-5)", borderBottom: "1px solid var(--border)" }}>
        <Bone w="50%" h={20} />
        <Bone w="75%" h={12} />
      </div>
      <RowBones count={rows} />
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="map-layout">
      <div className="map-pane" style={{ background: "var(--map-bg)" }} />
      <Rail className="incident-rail" side="right" rows={6} />
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="review-layout">
      <Rail className="review-queue" side="left" rows={4} />
      <div style={{ flex: 1, ...column("var(--space-5)"), padding: "var(--space-6)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-5)" }}>
          <Bone w={48} h={48} style={{ borderRadius: "50%" }} />
          <div style={{ ...column("var(--space-2)"), flex: 1 }}>
            <Bone w="40%" h={24} />
            <Bone w="30%" h={12} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-5)" }}>
          <div style={column("var(--space-4)")}>
            <Bone h={220} style={{ borderRadius: "var(--radius-lg)" }} />
            <Bone h={180} style={{ borderRadius: "var(--radius-lg)" }} />
          </div>
          <Bone h={416} style={{ borderRadius: "var(--radius-lg)" }} />
        </div>
      </div>
    </div>
  );
}

/** Dispatch order, Archive, Resolved (and Submit): page title over a card of rows. */
function TableSkeleton() {
  return (
    <div className="page">
      <div style={{ ...column("var(--space-2)"), marginBottom: "var(--space-5)" }}>
        <Bone w={220} h={28} />
        <Bone w={360} h={12} style={{ maxWidth: "100%" }} />
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <RowBones count={8} />
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="page" style={{ maxWidth: 1200, paddingTop: "var(--space-5)" }}>
      <Bone w={120} h={12} style={{ marginBottom: "var(--space-4)" }} />
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ ...column("var(--space-2)"), padding: "var(--space-6)", borderBottom: "1px solid var(--border)" }}>
          <Bone w="35%" h={28} />
          <Bone w="25%" h={12} />
        </div>
        <div className="detail-grid">
          <div style={column("var(--space-4)")}>
            <Bone h={200} style={{ borderRadius: "var(--radius-lg)" }} />
            {Array.from({ length: 5 }, (_, i) => (
              <Bone key={i} h={14} />
            ))}
          </div>
          <div style={column("var(--space-5)")}>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Bone w={132} h={40} style={{ borderRadius: "var(--radius-md)" }} />
              <Bone w={168} h={40} style={{ borderRadius: "var(--radius-md)" }} />
            </div>
            <Bone h={140} style={{ borderRadius: "var(--radius-lg)" }} />
            <Bone h={120} style={{ borderRadius: "var(--radius-lg)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stands in for the page while the incident store loads, shaped like the route being opened. */
export function RouteSkeleton() {
  const path = usePathname();
  const shape =
    path === "/coordinator" ? <MapSkeleton /> :
    path.startsWith("/coordinator/review") ? <ReviewSkeleton /> :
    path.startsWith("/coordinator/incident/") ? <DetailSkeleton /> :
    <TableSkeleton />;
  return (
    <div role="status" aria-busy="true" aria-label="Loading incident data" style={{ height: "100%" }}>
      {shape}
    </div>
  );
}
