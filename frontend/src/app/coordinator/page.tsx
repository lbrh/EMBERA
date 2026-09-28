"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ActiveIncidentsRail } from "@/components/map/ActiveIncidentsRail";
import { RailResizer, useRailWidth } from "@/components/map/RailResizer";

// Leaflet reads `window` at import time, so the map canvas is client-only.
const MapCanvas = dynamic(
  () => import("@/components/map/MapCanvas").then((m) => m.MapCanvas),
  { ssr: false, loading: () => <div className="map-pane" style={{ background: "var(--map-bg)" }} /> }
);

export default function MapPage() {
  const [railWidth, setRailWidth] = useRailWidth();
  // Narrow portrait screens stack the list under the map (layout.css); the handle trades space between them.
  const [listExpanded, setListExpanded] = useState(false);
  return (
    <div className="map-layout" data-list={listExpanded ? "expanded" : undefined}>
      {/* the map is the page, so its heading is for screen readers only (absolutely positioned, off the grid) */}
      <h1 className="sr-only">Incident map</h1>
      <MapCanvas />
      <RailResizer width={railWidth} onChange={setRailWidth} />
      <button
        type="button"
        className="rail-handle"
        aria-label={listExpanded ? "Show more map" : "Show more incidents"}
        onClick={() => setListExpanded((v) => !v)}
      >
        <span className="rail-handle__grip" aria-hidden />
      </button>
      <ActiveIncidentsRail width={railWidth} />
    </div>
  );
}
