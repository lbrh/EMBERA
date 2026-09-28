"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { liveDispatched, reviewQueue } from "@/lib/store/selectors";
import { TABS, type TabHref } from "@/lib/constants/nav";

// Tab icons, shown only in the phone's bottom tab bar (layout.css), where labels are too short to scan alone.
const TAB_ICONS: Record<TabHref, string> = {
  "/coordinator": "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  "/coordinator/dispatch": "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  "/coordinator/review": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
  "/coordinator/resolved": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6",
  "/coordinator/archive": "M3 5h18v4H3zM5 9v10h14V9M10 13h4",
  "/coordinator/crews": "M4 17h2m12 0h2M3 13l2-6h9l3 4h3v6H3zM7.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 7v4",
};

export function Header() {
  const keysOpen = useIncidentStore((s) => s.keysOpen);
  const setKeysOpen = useIncidentStore((s) => s.setKeysOpen);
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const liveCount = liveDispatched(incidents, order).length;
  const flaggedCount = reviewQueue(incidents, order).length;

  const lastTabPath = useIncidentStore((s) => s.lastTabPath);
  const pathname = usePathname();
  // Incident Detail is reached by click-through, not a tab: whichever tab the user came from
  // stays marked as current there.
  const onIncident = pathname?.startsWith("/coordinator/incident/");
  const activeHref = onIncident ? lastTabPath : pathname;
  const tabLabel = TABS.find((t) => t.href === pathname)?.label;

  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const update = () =>
      setNow(new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }));
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="app-header">
      {/* React hoists this into <head>; incident detail sets its own */}
      {!onIncident && tabLabel ? <title>{`${tabLabel} · Coordinator · EMBERA`}</title> : null}
      <Brand />

      {/* one nav for every width: a top tab row, or the bottom tab bar on a phone (layout.css) */}
      <nav aria-label="Screens" className="app-nav">
        {TABS.map((tab) => {
          const active = activeHref === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              id={`tab-${tab.short.toLowerCase()}`}
              className="nav-tab chrome-tab"
              aria-current={active ? "page" : undefined}
            >
              <svg
                className="nav-tab__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={TAB_ICONS[tab.href]} />
              </svg>
              <span className="nav-tab__full">{tab.label}</span>
              <span className="nav-tab__short">{tab.short}</span>
              {tab.short === "Review" && flaggedCount > 0 ? (
                <span
                  className="chip chip--pill data nav-tab__badge"
                  aria-label={`${flaggedCount} waiting`}
                  style={{
                    height: 18,
                    padding: "0 7px",
                    fontSize: 11,
                    color: "var(--on-primary)",
                    background: "var(--primary)",
                  }}
                >
                  {flaggedCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: "none" }}>
        {now ? (
          <span className="data app-clock" style={{ font: "500 var(--text-xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}>
            {now} AEST
          </span>
        ) : null}
        {liveCount > 0 ? (
          <span
            className="chip chip--pill"
            style={{ color: "var(--ok-fg)", background: "var(--ok-soft)", borderColor: "var(--ok-border)" }}
          >
            <span className="chip__dot" aria-hidden />
            {liveCount} live
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "none" }}>
        <button
          type="button"
          className="icon-btn app-keys-btn"
          onClick={() => setKeysOpen(!keysOpen)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          style={{ fontWeight: 700 }}
        >
          ?
        </button>


        <span
          className="app-avatar"
          aria-label="Signed in as Emergency Coordinator"
          role="img"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-border)",
            alignItems: "center",
            justifyContent: "center",
            font: "600 12px/1 var(--font-plex-sans)",
            color: "var(--accent-fg)",
            marginLeft: 4,
          }}
        >
          EC
        </span>
      </div>
    </header>
  );
}

// The tonal stripe flame (docs/brand/logo-options/stripe-flame-tonal.svg): each stripe's tone, top to
// bottom. Colours are theme tokens (--logo-1..5), so dark mode flips the fade.
const LOGO_TONES = [1, 2, 2, 3, 3, 4, 4, 5];

export function LogoMark({ size = 28 }: { size?: number }) {
  const clipId = `logo-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flex: "none" }}>
      <clipPath id={clipId}>
        <path d="M18 2C19 7 25 11 25 20A9 9 0 0 1 7 20C7 15.5 8.5 12 10 9C10.5 12 11.5 14 13.5 15.5C12.5 10 14 5.5 18 2Z" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {LOGO_TONES.map((tone, i) => (
          <rect key={i} y={3 + i * 3.5} width={32} height={2.25} fill={`var(--logo-${tone})`} />
        ))}
      </g>
    </svg>
  );
}

/** Always goes to the overview (/), whichever view it sits in. */
function Brand() {
  return (
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }} aria-label="EMBERA home">
      <LogoMark />
      <span
        className="app-brand__word"
        style={{
          font: "700 var(--text-base)/1 var(--font-plex-sans)",
          letterSpacing: "var(--tracking-tight)",
          color: "var(--fg)",
        }}
      >
        EMBERA
      </span>
    </Link>
  );
}

/** The overview, civilian and crew screens: brand and which view this is. No tabs. */
export function SimpleHeader({ view, children, title = `${view} · EMBERA` }: { view: string; children?: ReactNode; title?: string }) {
  return (
    <header className="app-header">
      <title>{title}</title>
      <Brand />
      <span className="caption" style={{ borderLeft: "1px solid var(--border)", paddingLeft: "var(--space-3)" }}>
        {view}
      </span>
      {children ? <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-5)" }}>{children}</div> : null}
    </header>
  );
}
