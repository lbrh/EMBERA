"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { filteredIncidents, legendCounts, mapMarkers } from "@/lib/store/selectors";
import { SEVERITY } from "@/lib/constants/severity";
import { STAGING_COORDS, distanceKm } from "@/lib/utils/geo";
import { clusterByProximity } from "@/lib/utils/project";
import { compass, dangerRating, spreadHours, spreadPerimeters } from "@/lib/utils/spread";
import { SeverityLegend } from "@/components/map/SeverityLegend";
import { SOURCE_META } from "@/components/primitives/SourceChip";
import { dataSource } from "@/lib/data-source";
import { relativeTime } from "@/lib/utils/time";
import type { Incident, SeverityBand } from "@/lib/types";

/**
 * Leaflet is imperative and touches `window` on import, so this module is only ever loaded
 * client-side (see the `ssr: false` dynamic import in the Map page). Everything the map draws
 * is derived from the incident store on each change (Leaflet owns the viewport, the store owns
 * the data), and the store's coarse `zoom` tier / `mapView` are written back from Leaflet's
 * events so the rest of the UI (legend header, tab-return) stays in step.
 */

type ZoomTier = 1 | 2 | 3; // regional (clustered) / district / site
const CLUSTER_THRESHOLD_PX = { 1: 64, 2: 0, 3: 0 } as const; // screen px; 0 disables clustering
const MAX_ZOOM = 19;
const INITIAL_MAX_ZOOM = 12;

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function tierFor(leafletZoom: number): ZoomTier {
  if (leafletZoom <= 10) return 1;
  if (leafletZoom <= 12) return 2;
  return 3;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function incidentIcon(incident: Incident): L.DivIcon {
  const meta = SEVERITY[incident.band as SeverityBand];
  const d = meta.dotDiameter;
  return L.divIcon({
    className: "fori-marker",
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    html:
      `<div class="fori-pin">` +
      `<div class="fori-dot" style="background:${meta.fillVar};color:${meta.textVar};` +
      `border:${meta.ringWidth}px solid ${meta.ringVar};font-size:${meta.numeralFont}px">` +
      `${incident.band}</div>` +
      `<span class="fori-label">${escapeHtml(incident.place)}</span>` +
      `</div>`,
  });
}

function clusterIcon(count: number, maxBand: SeverityBand): L.DivIcon {
  const size = 40 + count * 4;
  const ring = SEVERITY[maxBand].ringVar;
  return L.divIcon({
    className: "fori-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<div class="fori-cluster" style="border-color:${ring}">` +
      `<span class="fori-cluster-count" style="color:${ring}">${count}</span>` +
      `<span class="fori-cluster-caption">sites</span>` +
      `</div>`,
  });
}

const HOVER_DELAY_MS = 350; // long enough that sweeping the cursor across the map doesn't flash cards

function div(className: string, text?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** Hover card for a marker: the field image (already in the browser cache, see preloadImages)
 * and the basics. Built as DOM rather than an HTML string, so no field needs escaping. */
function hoverCard(incident: Incident): HTMLElement {
  const card = div("hover-card");
  const src = dataSource.getImagePreviewUrl(incident.file, 240);
  if (src) {
    const img = document.createElement("img");
    img.className = "hover-card__img";
    img.alt = "";
    img.src = src;
    img.addEventListener("error", () => img.remove());
    card.append(img);
  }
  const meta = SEVERITY[incident.band as SeverityBand];
  const severity = div("hover-card__severity");
  const dot = document.createElement("span");
  dot.className = "hover-card__dot";
  dot.style.background = meta.fillVar;
  dot.style.borderColor = meta.ringVar;
  severity.append(dot, `${meta.label} · level ${incident.band}`);
  const status = incident.dispatch === "live" ? "Crew dispatched" : "Awaiting dispatch";
  const confidence = incident.confidence != null ? ` · conf ${incident.confidence.toFixed(2)}` : "";
  const body = div("hover-card__body");
  body.append(
    div("hover-card__title", incident.place),
    severity,
    div("hover-card__meta", `${incident.ref} · ${status}`),
    div("hover-card__meta", `${relativeTime(incident.capturedAtIso)} · ${SOURCE_META[incident.source].abbr}${confidence}`)
  );
  card.append(body);
  return card;
}

/** The one image under review a reviewer asked to see ("Locate on map"): a dashed pending ring,
 * never a severity colour, since it has no applied severity yet. */
function reviewIcon(incident: Incident): L.DivIcon {
  return L.divIcon({
    className: "fori-marker is-new",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html:
      `<div class="fori-pin">` +
      `<div class="fori-review">?</div>` +
      `<span class="fori-label">Under review · ${escapeHtml(incident.place)}</span>` +
      `</div>`,
  });
}

function spreadTooltip(incident: Incident): string {
  const w = incident.weather!;
  // one entry per hour, collapsed while the wind holds: "NW 35 → SW 30 km/h"
  const winds = spreadHours(w)
    .map((h) => `${compass(h.windFromDeg)} ${Math.round(h.windKmh)}`)
    .filter((wind, i, all) => wind !== all[i - 1]);
  return (
    `<strong>Indicative spread if unchecked</strong> · 1, 2 and 3 h<br>` +
    `FFDI ${w.ffdi} (legacy ${dangerRating(w.ffdi)}) · wind ${winds.join(" → ")} km/h` +
    `${winds.length > 1 ? " (forecast change)" : ""}<br>` +
    `Rough estimate, not a forecast: no ember spotting or slope`
  );
}

const extinguishedIcon = () =>
  L.divIcon({
    className: "fori-marker fori-marker-out",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="fori-out">Out</div>`,
  });

export function MapCanvas() {
  const router = useRouter();
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const setMapView = useIncidentStore((s) => s.setMapView);
  const mapFilter = useIncidentStore((s) => s.mapFilter);
  const mapHoverId = useIncidentStore((s) => s.mapHoverId);
  const setMapHoverId = useIncidentStore((s) => s.setMapHoverId);
  const setAlertsPanelOpen = useIncidentStore((s) => s.setAlertsPanelOpen);
  const newIncidentId = useIncidentStore((s) => s.newIncidentId);
  const group = useIncidentStore((s) => s.group);
  const mapFocusId = useIncidentStore((s) => s.mapFocusId);
  const clearMapFocus = useIncidentStore((s) => s.clearMapFocus);
  const selectReview = useIncidentStore((s) => s.selectReview);
  // shown as its own pin only while it's still under review; once decided it's an ordinary marker
  const focus = mapFocusId ? incidents[mapFocusId] : undefined;
  const focusUnderReview = focus?.flag === "flagged_review" ? focus : undefined;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const spreadLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const focusLayerRef = useRef<L.LayerGroup | null>(null);
  /** incident id -> the marker currently representing it (its own pin, or its cluster). */
  const markerByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const [leafletZoom, setLeafletZoom] = useState<number | null>(null);

  const counts = legendCounts(incidents, order);

  // Map lifecycle: create once, tear down on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const state = useIncidentStore.getState();

    const map = L.map(container, {
      zoomControl: false,
      maxZoom: MAX_ZOOM,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);

    if (state.mapView) {
      map.setView(state.mapView.center, state.mapView.zoom);
    } else {
      const coords = mapMarkers(state.incidents, state.order).map(
        (i) => [i.coords.lat, i.coords.lng] as [number, number]
      );
      // nothing to frame yet: centre on the staging ground rather than an empty (invalid) bounds
      if (coords.length === 0) coords.push([STAGING_COORDS.lat, STAGING_COORDS.lng]);
      map.fitBounds(L.latLngBounds(coords), { padding: [56, 56], maxZoom: INITIAL_MAX_ZOOM });
    }

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map);
    spreadLayerRef.current = L.layerGroup().addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    focusLayerRef.current = L.layerGroup().addTo(map);

    const syncZoom = () => setLeafletZoom(map.getZoom());
    const syncView = () => {
      const c = map.getCenter();
      setMapView({ center: [c.lat, c.lng], zoom: map.getZoom() });
    };
    map.on("zoomend", syncZoom);
    map.on("moveend", syncView);
    syncZoom();
    syncView();

    // The canvas is a flex child, so keep Leaflet's cached size in step with the layout.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);

    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      spreadLayerRef.current = null;
      overlayLayerRef.current = null;
      focusLayerRef.current = null;
      markerByIdRef.current = new Map();
      useIncidentStore.getState().setMapHoverId(null);
    };
  }, [setMapView]);

  // Incident markers: rebuilt from the store whenever the data, filter or zoom level changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer || leafletZoom === null) return;

    layer.clearLayers();
    const markerById = new Map<string, L.Marker>();

    const shown = filteredIncidents(incidents, order, mapFilter);
    const markers = shown.filter((i) => i.dispatch !== "extinguished");
    const points = markers.map((incident) => {
      const p = map.project([incident.coords.lat, incident.coords.lng], leafletZoom);
      return { id: incident.id, x: p.x, y: p.y, incident };
    });
    const threshold = CLUSTER_THRESHOLD_PX[tierFor(leafletZoom)];
    const clusters = threshold > 0 ? clusterByProximity(points, threshold) : points.map((p) => [p]);

    // One hover card at a time, opened after a short pause over (or keyboard focus on) a marker.
    let cardTimer: ReturnType<typeof setTimeout> | undefined;
    let card: L.Tooltip | null = null;
    const hideCard = () => {
      clearTimeout(cardTimer);
      card?.remove();
      card = null;
    };
    const showCardSoon = (incident: Incident) => {
      hideCard();
      cardTimer = setTimeout(() => {
        const offset = SEVERITY[incident.band as SeverityBand].dotDiameter / 2 + 6;
        card = L.tooltip({ direction: "top", offset: [0, -offset], className: "fori-hover-card", opacity: 1 })
          .setLatLng([incident.coords.lat, incident.coords.lng])
          .setContent(hoverCard(incident))
          .addTo(map);
      }, HOVER_DELAY_MS);
    };

    const wireHover = (marker: L.Marker, id: string, incident?: Incident) => {
      const enter = () => {
        setMapHoverId(id);
        if (incident) showCardSoon(incident);
      };
      const leave = () => {
        setMapHoverId(null);
        hideCard();
      };
      marker.on("mouseover", enter);
      marker.on("mouseout", leave);
      marker.on("click", hideCard);
      const el = marker.getElement();
      el?.addEventListener("focus", enter);
      el?.addEventListener("blur", leave);
    };

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        const incident = cluster[0].incident;
        const label = `${incident.place} · ${incident.ref}`;
        // no `title`: the browser's own tooltip would pop up over the hover card
        const marker = L.marker([incident.coords.lat, incident.coords.lng], {
          icon: incidentIcon(incident),
          riseOnHover: true,
          zIndexOffset: (incident.band as number) * 100,
        })
          .on("click", () => router.push(`/incident/${incident.id}`))
          .addTo(layer);
        marker.getElement()?.setAttribute("aria-label", `${label}, ${SEVERITY[incident.band as SeverityBand].label}`);
        if (incident.id === newIncidentId) marker.getElement()?.classList.add("is-new");
        wireHover(marker, incident.id, incident);
        markerById.set(incident.id, marker);
        continue;
      }

      const members = cluster.map((p) => p.incident);
      const bounds = L.latLngBounds(members.map((i) => [i.coords.lat, i.coords.lng]));
      const maxBand = Math.max(...members.map((i) => i.band as number)) as SeverityBand;
      const label = `${members.length} sites in this area · click to expand`;
      const marker = L.marker(bounds.getCenter(), {
        icon: clusterIcon(members.length, maxBand),
        title: label,
        zIndexOffset: 1000,
      })
        .on("click", () =>
          map.flyToBounds(bounds, {
            padding: [80, 80],
            maxZoom: Math.max(map.getZoom() + 2, 11),
            duration: 0.4,
          })
        )
        .addTo(layer);
      marker.getElement()?.setAttribute("aria-label", label);
      for (const incident of members) markerById.set(incident.id, marker);
    }

    for (const incident of shown.filter((i) => i.dispatch === "extinguished")) {
      L.marker([incident.coords.lat, incident.coords.lng], {
        icon: extinguishedIcon(),
        interactive: false,
        keyboard: false,
        zIndexOffset: -500,
      }).addTo(layer);
    }

    markerByIdRef.current = markerById;
    applyHover(markerById, useIncidentStore.getState().mapHoverId);
    return hideCard;
  }, [leafletZoom, incidents, order, mapFilter, newIncidentId, router, setMapHoverId]);

  // Spread envelopes for open fires with weather: where each could reach in 1-3 h, following the wind.
  useEffect(() => {
    const layer = spreadLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const incident of filteredIncidents(incidents, order, mapFilter)) {
      if (incident.dispatch === "extinguished" || !incident.weather) continue;
      const rings = spreadPerimeters(incident.coords, incident.weather, incident.elements.vegetation);
      // outermost first, so the inner (more certain) rings sit on top
      rings?.reverse().forEach((ring, i) => {
        L.polygon(ring, { className: `fori-spread fori-spread--${incident.band}`, fillOpacity: 0.12 + 0.08 * i })
          .bindTooltip(spreadTooltip(incident), { direction: "top", sticky: true, className: "fori-tooltip" })
          .addTo(layer);
      });
    }
  }, [incidents, order, mapFilter]);

  // Pending grouping suggestion: a dashed ring around its members that opens the proposal card.
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!group || group.state !== "suggested") return;

    // only members already drawn on the map: a ring centred partly on a flagged image would
    // leak the location the "never drawn on the map" rule is keeping off it
    const onMap = new Set(mapMarkers(incidents, order).map((i) => i.id));
    const members = group.memberIds.filter((id) => onMap.has(id)).map((id) => incidents[id]);
    if (members.length < 2) return;
    const center = {
      lat: members.reduce((s, i) => s + i.coords.lat, 0) / members.length,
      lng: members.reduce((s, i) => s + i.coords.lng, 0) / members.length,
    };
    const radiusM = Math.max(...members.map((i) => distanceKm(i.coords, center))) * 1000 + 600;

    L.circle([center.lat, center.lng], {
      radius: radiusM,
      className: "fori-group-ring",
      bubblingMouseEvents: false,
    })
      .bindTooltip(`Grouping suggested · ${members.length} images · click to review`, {
        direction: "top",
        className: "fori-tooltip",
      })
      .on("click", () => setAlertsPanelOpen(true))
      .addTo(layer);
  }, [group, incidents, order, setAlertsPanelOpen]);

  // "Locate on map" from Manual review: that one image's pin, which opens it back in review.
  useEffect(() => {
    const layer = focusLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!focusUnderReview) return;
    const marker = L.marker([focusUnderReview.coords.lat, focusUnderReview.coords.lng], {
      icon: reviewIcon(focusUnderReview),
      zIndexOffset: 2000,
    })
      .on("click", () => {
        selectReview(focusUnderReview.id);
        router.push("/review");
      })
      .addTo(layer);
    marker.getElement()?.setAttribute("aria-label", `${focusUnderReview.place}, under review. Open in manual review`);
  }, [focusUnderReview, router, selectReview]);

  // Hover linkage with the Active Incidents rail.
  useEffect(() => {
    applyHover(markerByIdRef.current, mapHoverId);
  }, [mapHoverId]);

  const atMin = leafletZoom !== null && leafletZoom <= 0;
  const atMax = leafletZoom !== null && leafletZoom >= MAX_ZOOM;

  return (
    <div
      className="map-pane"
      style={{
        position: "relative",
        background: "var(--map-bg)",
        overflow: "hidden",
        // keeps Leaflet's internal z-indexes (panes at 400+, controls at 800+) below the
        // app's fixed toasts / shortcut panel
        isolation: "isolate",
      }}
    >
      <div
        ref={containerRef}
        className="fori-map"
        aria-label="Incident map. Arrow keys pan, plus and minus zoom."
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />

      <div
        className="card"
        style={{
          position: "absolute",
          right: "var(--space-4)",
          top: "var(--space-4)",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: 3,
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <button
          type="button"
          className="icon-btn icon-btn--bare"
          onClick={() => mapRef.current?.zoomOut()}
          disabled={atMin}
          aria-label="Zoom out"
          style={{ fontSize: 18 }}
        >
          −
        </button>
        <span
          className="data"
          aria-label={`Zoom level ${leafletZoom ?? "unknown"}`}
          style={{ minWidth: 34, textAlign: "center", font: "500 var(--text-2xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}
        >
          Z{leafletZoom ?? "–"}
        </span>
        <button
          type="button"
          className="icon-btn icon-btn--bare"
          onClick={() => mapRef.current?.zoomIn()}
          disabled={atMax}
          aria-label="Zoom in"
          style={{ fontSize: 18 }}
        >
          +
        </button>
      </div>

      {focusUnderReview ? (
        <div className="card map-focus-bar" role="status">
          <span style={{ flex: "1 1 auto", minWidth: 0 }}>
            <strong>{focusUnderReview.ref}</strong> · under review<span className="map-focus-bar__more">, shown only for you</span>
          </span>
          <button
            type="button"
            className="btn btn--link btn--sm"
            onClick={() => {
              selectReview(focusUnderReview.id);
              router.push("/review");
            }}
          >
            Back to review
          </button>
          <button type="button" className="icon-btn icon-btn--bare" aria-label="Hide this image from the map" onClick={clearMapFocus}>
            ✕
          </button>
        </div>
      ) : null}

      <SeverityLegend counts={counts} />
    </div>
  );
}

function applyHover(markerById: Map<string, L.Marker>, hoverId: string | null) {
  const hovered = hoverId ? markerById.get(hoverId) : undefined;
  for (const marker of new Set(markerById.values())) {
    marker.getElement()?.classList.toggle("is-hover", marker === hovered);
  }
}
