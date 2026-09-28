"use client";

import { useEffect, useRef } from "react";
import { useIncidentStore } from "@/lib/store/useIncidentStore";

const GROUPS = [
  {
    title: "Moving around",
    rows: [
      { keys: ["Tab"], what: "Next control. The first stop is a skip-to-main-content link." },
      { keys: ["Shift", "Tab"], what: "Previous control." },
      { keys: ["←", "→"], what: "Switch screen, from anywhere on the page except the focused map." },
      { keys: ["↑↓←→"], what: "Pan the map when it has focus." },
      { keys: ["+", "−"], what: "Zoom the map when it has focus." },
      { keys: ["Alt", "1–7"], what: "Jump to Map, Dispatch order, Manual review, Resolved, Archive, Submit image or Crews." },
    ],
  },
  {
    title: "Acting",
    rows: [
      { keys: ["Enter"], what: "Activate the focused control." },
      { keys: ["Space"], what: "Same as Enter." },
      { keys: ["Esc"], what: "Close this panel." },
    ],
  },
  { title: "Help", rows: [{ keys: ["?"], what: "Open or close this shortcut list." }] },
];

export function ShortcutPanel() {
  const keysOpen = useIncidentStore((s) => s.keysOpen);
  const setKeysOpen = useIncidentStore((s) => s.setKeysOpen);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (keysOpen) closeRef.current?.focus();
  }, [keysOpen]);

  if (!keysOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "var(--scrim)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto", // a phone held sideways is shorter than the panel
        padding: "clamp(16px, 12vh, 96px) var(--space-4) var(--space-4)",
      }}
      onClick={() => setKeysOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-title"
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "100%",
          boxShadow: "var(--shadow-pop)",
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-5)",
          animation: "toastIn var(--dur) var(--ease)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2
            id="shortcut-title"
            style={{
              font: "700 var(--text-lg)/1.2 var(--font-plex-sans)",
              letterSpacing: "var(--tracking-tight)",
              color: "var(--fg)",
            }}
          >
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn icon-btn--bare"
            onClick={() => setKeysOpen(false)}
            aria-label="Close keyboard shortcuts"
          >
            ✕
          </button>
        </div>
        {GROUPS.map((group) => (
          <section key={group.title} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 className="label" style={{ color: "var(--muted)" }}>
              {group.title}
            </h3>
            {group.rows.map((row) => (
              <div key={row.what} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", gap: 4, flex: "0 0 112px" }}>
                  {row.keys.map((k) => (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </div>
                <span style={{ font: "400 var(--text-sm)/1.45 var(--font-plex-sans)", color: "var(--fg-2)" }}>
                  {row.what}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
