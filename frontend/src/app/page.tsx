"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { LogoMark, SimpleHeader } from "@/components/chrome/Header";

type ViewId = "civilian" | "coordinator" | "crew";

const VIEWS: {
  id: ViewId;
  title: string;
  who: string;
  body: string;
  can: string[];
  pages: { href: string; label: string }[];
  shot: { name: string; phone: boolean; alt: string };
}[] = [
  {
    id: "civilian",
    title: "Civilian",
    who: "For the public",
    body: "A simple form anyone can use to report a fire with a photo. No account, no app to install.",
    can: [
      "Attach a photo, or take one on a phone",
      "Use the device's location and the current time, or read them from the photo",
      "Get a reference number once the report is received",
    ],
    pages: [{ href: "/civilian", label: "Report a fire" }],
    shot: { name: "civilian", phone: true, alt: "The civilian Report a fire form on a phone" },
  },
  {
    id: "coordinator",
    title: "Coordinator",
    who: "For emergency coordinators",
    body: "Where coordinators work. Every incident on one map, ranked by risk, with the tools to check the AI and send crews.",
    can: [
      "See every fire on a map, with spread rings and street, satellite or terrain layers",
      "Confirm or correct AI results in manual review",
      "Work the dispatch order and send crews",
      "Merge or split incidents, comment, and close fires out",
    ],
    pages: [
      { href: "/coordinator", label: "Map" },
      { href: "/coordinator/dispatch", label: "Dispatch order" },
      { href: "/coordinator/review", label: "Manual review" },
      { href: "/coordinator/resolved", label: "Resolved" },
      { href: "/coordinator/archive", label: "Archive" },
      { href: "/coordinator/crews", label: "Crews" },
    ],
    shot: { name: "coordinator-dispatch", phone: false, alt: "The coordinator's dispatch order, ranked by severity" },
  },
  {
    id: "crew",
    title: "Crew",
    who: "For response crews, on a phone",
    body: "What a crew needs on the way and at the fire, and nothing else. Every action is shared with the coordinator as it happens.",
    can: [
      "See the assignment, with directions",
      "Report en route and on scene",
      "Mark the fire out or a false alarm, and change its severity",
      "Add photos and ask for more crews",
    ],
    pages: [{ href: "/crew", label: "Crew view" }],
    shot: { name: "crew", phone: true, alt: "A crew's on-scene actions on a phone" },
  },
];

const STATS = [
  { num: "4", label: "AI indicator models on watsonx.ai score every image" },
  { num: "0.75", label: "Confidence at or below this goes to a person, never straight to the map" },
  { num: "10 min", label: "Fire weather refreshed from the nearest BoM station" },
  { num: "5 s", label: "Live updates between the coordinator and crews" },
];

const STEPS = [
  { title: "Report", body: "The public, drones, CCTV and satellites send in photos with where and when they were taken." },
  { title: "Assess", body: "AI checks it's a fire, then rates severity from 1 to 4 with a written reason. Unsure results go to a person." },
  { title: "Coordinate", body: "Incidents are grouped, ranked and shown on a map with forecast spread. Coordinators decide who goes where." },
  { title: "Respond", body: "Crews report their progress, add photos, ask for support and mark the fire out." },
];

const CAPABILITIES = [
  { tag: "watsonx.ai", title: "AI severity scoring", body: "Four models score smoke, flame, vegetation and infrastructure. A published rubric turns them into a severity from 1 to 4, a confidence and a reason." },
  { tag: "Rule", title: "Fire / not-a-fire check", body: "An image with no smoke or flame is marked uncertain and held for a person. It is never shown as a confirmed fire." },
  { tag: "Audit", title: "Human in the loop", body: "Coordinators confirm, change or discard any result. Every override is logged next to the AI's original, with who made it and when." },
  { tag: "BoM + Open-Meteo", title: "Fire weather and spread", body: "Current conditions from the nearest weather station and forecast wind drive spread rings on the map, checked against the 2019–20 fires." },
  { tag: "2 km · 6 h", title: "Incident grouping", body: "Photos of the same fire join one incident automatically. Coordinators merge incidents or split a photo off when it's a different fire." },
  { tag: "Live", title: "Crew dispatch", body: "Send crews, follow them en route and on scene, and answer their requests for support as they arrive." },
];

const STACK = [
  { name: "IBM watsonx.ai", role: "Runs the four indicator models" },
  { name: "IBM Cloud Object Storage", role: "Stores every submitted image" },
  { name: "IBM Code Engine", role: "Hosts the web app and the API" },
  { name: "PostgreSQL", role: "Incidents, decisions, crews and the audit log" },
];

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M9.3 3.7 13.1 7.5H1v1h12.1l-3.8 3.8.7.7 5-5-5-5z" />
    </svg>
  );
}

/** The hero's right-hand art: the logo, large. */
function HeroArt() {
  return (
    <div className="lp-hero__art" aria-hidden>
      <LogoMark size={280} />
    </div>
  );
}

/** A product screenshot captured from the app, in the theme the browser is using. */
function Shot({ name, alt, phone = false, priority = false }: { name: string; alt: string; phone?: boolean; priority?: boolean }) {
  const [w, h] = phone ? [780, 1688] : [1440, 900];
  return (
    <picture>
      <source srcSet={`/product/${name}-dark.webp`} media="(prefers-color-scheme: dark)" />
      <img
        src={`/product/${name}-light.webp`}
        alt={alt}
        width={w}
        height={h}
        loading={priority ? "eager" : "lazy"}
        className={phone ? "lp-shot lp-shot--phone" : "lp-shot"}
      />
    </picture>
  );
}

/** The front door: what EMBERA is, the three views, and where each page lives. */
export default function Overview() {
  const [active, setActive] = useState<ViewId>("coordinator");
  const tabRefs = useRef<Record<ViewId, HTMLButtonElement | null>>({ civilian: null, coordinator: null, crew: null });
  const view = VIEWS.find((v) => v.id === active)!;

  // arrow keys move between tabs (WAI-ARIA tabs pattern)
  function onTabKey(e: KeyboardEvent) {
    const i = VIEWS.findIndex((v) => v.id === active);
    const next = e.key === "ArrowRight" ? (i + 1) % VIEWS.length : e.key === "ArrowLeft" ? (i - 1 + VIEWS.length) % VIEWS.length : null;
    if (next === null) return;
    e.preventDefault();
    setActive(VIEWS[next].id);
    tabRefs.current[VIEWS[next].id]?.focus();
  }

  return (
    <div className="app-shell lp">
      <SimpleHeader view="Overview" title="EMBERA | Bushfire situational awareness">
        <nav aria-label="On this page" className="lp-nav-links">
          <a className="lp-link" href="#views">Views</a>
          <a className="lp-link" href="#how">How it works</a>
          <a className="lp-link" href="#capabilities">Capabilities</a>
        </nav>
        <Link href="/coordinator" className="lp-btn lp-btn--primary lp-btn--sm">
          View the map <Arrow />
        </Link>
      </SimpleHeader>

      <main id="main" tabIndex={-1} className="app-main">
        <section className="lp-band lp-band--muted" aria-labelledby="lp-title">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            <div className="lp-hero">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
                <span className="lp-eyebrow">EMBERA - Emergency Monitoring for Bushfire Evaluation, Response and Awareness</span>
                <h1 id="lp-title" className="lp-display">See every fire. Send the right crew first.</h1>
                <p className="lp-lede">
                  EMBERA turns photos from the public, drones, CCTV and satellites into scored, ranked incidents on one map, so
                  coordinators can dispatch crews in order of risk.
                </p>
                <div className="lp-actions" style={{ marginTop: "var(--space-3)" }}>
                  <Link href="/coordinator" className="lp-btn lp-btn--primary">
                    Open coordinator view <Arrow />
                  </Link>
                  <Link href="/civilian" className="lp-btn lp-btn--tertiary">
                    Report a fire <Arrow />
                  </Link>
                </div>
              </div>
              <HeroArt />
            </div>
            <div style={{ marginTop: "var(--space-7)" }}>
              <Shot name="coordinator-map" alt="The coordinator map with ranked active incidents" priority />
            </div>
          </div>
        </section>

        <section className="lp-band" aria-label="Key figures">
          <div className="lp-wrap lp-stats">
            {STATS.map((s) => (
              <div key={s.num} className="lp-stat">
                <span className="lp-stat__num data">{s.num}</span>
                <span className="lp-body">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="views" className="lp-band" aria-labelledby="lp-views">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <h2 id="lp-views" className="lp-h2">One platform, three views</h2>
              <p className="lp-body" style={{ maxWidth: "60ch" }}>
                Each view has its own address and header, built for the person using it. There are no logins in this demo: open
                any view directly.
              </p>
            </div>

            <div>
              <div role="tablist" aria-label="Views" className="lp-tabs" onKeyDown={onTabKey}>
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    ref={(el) => {
                      tabRefs.current[v.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`lp-tab-${v.id}`}
                    aria-selected={active === v.id}
                    aria-controls="lp-panel"
                    tabIndex={active === v.id ? 0 : -1}
                    className="lp-tab"
                    onClick={() => setActive(v.id)}
                  >
                    {v.title}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id="lp-panel" aria-labelledby={`lp-tab-${view.id}`} className="lp-panel">
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <span className="lp-eyebrow">{view.who}</span>
                    <h3 className="lp-h3">{view.title} view</h3>
                    <p className="lp-body">{view.body}</p>
                  </div>

                  <div>
                    <h4 className="label" style={{ marginBottom: "var(--space-2)" }}>What you can do</h4>
                    <ul className="lp-list">
                      {view.can.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="label" style={{ marginBottom: "var(--space-2)" }}>Pages</h4>
                    <ul className="lp-list lp-pages">
                      {view.pages.map((p) => (
                        <li key={p.href}>
                          <Link href={p.href} className="lp-link">
                            {p.label}
                          </Link>
                          <span className="data caption">{p.href}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <Link href={view.pages[0].href} className="lp-btn lp-btn--primary">
                      Open {view.title.toLowerCase()} view <Arrow />
                    </Link>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: view.shot.phone ? "center" : "stretch" }}>
                  <Shot key={view.shot.name} name={view.shot.name} alt={view.shot.alt} phone={view.shot.phone} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="lp-band lp-band--muted" aria-labelledby="lp-how">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <h2 id="lp-how" className="lp-h2">From first photo to crews on scene</h2>
            <ol className="lp-grid-4" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {STEPS.map((step, i) => (
                <li key={step.title} className="lp-step">
                  <span className="data caption">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="lp-h3">{step.title}</h3>
                  <p className="lp-body">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="capabilities" className="lp-band" aria-labelledby="lp-caps">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <h2 id="lp-caps" className="lp-h2">AI that shows its working, and people who make the call</h2>
            <div className="lp-tiles">
              {CAPABILITIES.map((c) => (
                <article key={c.title} className="lp-tile">
                  <span className="lp-tag">{c.tag}</span>
                  <h3 className="lp-h3">{c.title}</h3>
                  <p className="lp-body">{c.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-band" aria-labelledby="lp-stack">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <h2 id="lp-stack" className="lp-h2">Built on IBM Cloud</h2>
            <ul className="lp-grid-4" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {STACK.map((s) => (
                <li key={s.name} className="lp-stat">
                  <span className="lp-h3">{s.name}</span>
                  <span className="lp-body">{s.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-band lp-band--inverse" aria-labelledby="lp-next">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            <h2 id="lp-next" className="lp-h2">Take the next step</h2>
            <p className="lp-lede">Open the coordinator view with demo data, or see what a crew sees in the field.</p>
            <div className="lp-actions">
              <Link href="/coordinator" className="lp-btn lp-btn--primary">
                Open coordinator view <Arrow />
              </Link>
              <Link href="/crew" className="lp-btn lp-btn--ghost-inverse">
                Open crew view <Arrow />
              </Link>
            </div>
          </div>
        </section>

        <footer className="lp-wrap lp-footer">
          <span className="caption">EMBERA · Emergency Monitoring for Bushfire Evaluation, Response and Awareness</span>
          <span className="caption">A prototype. In an emergency, call Triple Zero (000).</span>
        </footer>
      </main>
    </div>
  );
}
