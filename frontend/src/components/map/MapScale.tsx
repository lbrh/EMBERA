/** Cartographic scale bar, styled after Google Maps: no card behind it, just a label and a
 * tick-ended line laid straight over the tiles, with a soft white halo so it reads on any
 * terrain. `widthPx` and `label` come from MapCanvas (Leaflet's own Control.Scale algorithm,
 * recomputed on every pan and zoom); the bar's width transitions instead of jumping between them. */
const HALO = "0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff";
const INK = "#3c4043";

export function MapScale({ widthPx, label }: { widthPx: number; label: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "var(--space-4)",
        top: "var(--space-4)",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          font: "500 12px/1 var(--font-plex-sans)",
          color: INK,
          textShadow: HALO,
        }}
      >
        {label}
      </span>
      <div style={{ position: "relative", width: widthPx, height: 7, transition: "width 0.15s ease-out" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 1, height: 2, background: INK, boxShadow: HALO }} />
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 2, height: 7, background: INK, boxShadow: HALO }} />
        <div style={{ position: "absolute", right: 0, bottom: 0, width: 2, height: 7, background: INK, boxShadow: HALO }} />
      </div>
    </div>
  );
}
