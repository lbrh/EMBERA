import Image from "next/image";
import Link from "next/link";
import {LogoMark, SimpleHeader} from "@/components/chrome/Header";
import SHOTS from "@/lib/constants/product-shots.json";

// One person per view, in the order a report travels: the public sends it, the coordinator
// dispatches, the crew responds. Grounded in the target users in docs/live/requirements.md.
const PERSONAS = [
    {
        id: "civilian",
        view: "Civilian",
        name: "Jess, lives near Kinglake",
        about: "Sees smoke on the ridge and wants someone to know, fast. No account and no app: a photo from the phone is enough.",
        flow: ["Takes a photo of the smoke", "Adds where and when, one tap each", "Sends it and gets a reference number"],
        href: "/civilian",
        shot: "civilian",
        // flat illustration in IBM's people style (made with Canva)
        photo: "/personas/civilian-illustration.jpg",
        photoAlt: "Illustration of Jess, a resident, holding a phone",
        alt: "The Report a fire form on a phone, filled in and ready to send",
    },
    {
        id: "coordinator",
        view: "Coordinator",
        // shown on a band in the hero's grey, to break up the three
        band: true,
        name: "Sam, duty incident coordinator",
        about: "Watches every report across the region and decides which fire gets a crew first. EMBERA sorts, scores and explains each one, so Sam can focus on the call.",
        flow: ["Sees every fire on one map, ranked", "Checks why the AI rated it that way", "Works down the dispatch order", "Sends the nearest free crew"],
        href: "/coordinator",
        shot: "coordinator-dispatch",
        // flat illustration in IBM's people style (made with Canva)
        photo: "/personas/coordinator-illustration.jpg",
        photoAlt: "Illustration of Sam, a coordinator, wearing a headset",
        alt: "The coordinator's dispatch order, ranked by severity",
    },
    {
        id: "crew",
        view: "Crew",
        name: "Alex, crew leader",
        about: "Needs a clear picture of the fire before arriving, and a quick way to report back from the scene.",
        flow: ["Gets the assignment, with directions", "Reports en route, then on scene", "Marks the fire out, or calls for more crews", "Checks the log, and undoes a mistake"],
        href: "/crew",
        shot: "crew-on-scene",
        // flat illustration in IBM's people style (made with Canva)
        photo: "/personas/crew-illustration.jpg",
        photoAlt: "Illustration of Alex, a crew leader, in a firefighting helmet and jacket",
        alt: "A crew's on-scene actions on a phone",
    },
];

const STATS = [
    {num: "~2 s", label: "For the AI to score a photo: four watsonx.ai models run side by side"},
    {num: "< 2 min", label: "Target from a photo being sent to its severity on the map"},
    {num: "5 s", label: "For a crew's update to reach the coordinator"},
    {num: "10 min", label: "Between fire-weather refreshes from the nearest weather station"},
];

const STEPS = [
    {
        title: "Report",
        body: "The public, drones, CCTV and satellites send in photos with where and when they were taken."
    },
    {
        title: "Assess",
        body: "AI checks it's a fire, then rates severity from 1 to 4 with a written reason. Unsure results go to a person."
    },
    {
        title: "Coordinate",
        body: "Incidents are grouped, ranked and shown on a map with forecast spread. Coordinators decide who goes where."
    },
    {title: "Respond", body: "Crews report their progress, add photos, ask for support and mark the fire out."},
];

const CAPABILITIES = [
    {
        tag: "watsonx.ai",
        title: "AI severity scoring",
        body: "Four models score smoke, flame, vegetation and infrastructure. A published rubric turns them into a severity from 1 to 4, a confidence and a reason."
    },
    {
        tag: "Rule",
        title: "Fire / not-a-fire check",
        body: "An image with no smoke or flame is marked uncertain and held for a person. It is never shown as a confirmed fire."
    },
    {
        tag: "Audit",
        title: "Human in the loop",
        body: "Coordinators confirm, change or discard any result. Every override is logged next to the AI's original, with who made it and when."
    },
    {
        tag: "BoM + Open-Meteo",
        title: "Fire weather and spread",
        body: "Current conditions from the nearest weather station and forecast wind drive spread rings on the map, checked against the 2019–20 fires."
    },
    {
        tag: "2 km · 6 h",
        title: "Incident grouping",
        body: "Photos of the same fire join one incident automatically. Coordinators merge incidents or split a photo off when it's a different fire."
    },
    {
        tag: "Live",
        title: "Crew dispatch",
        body: "Send crews, follow them en route and on scene, and answer their requests for support as they arrive."
    },
];

const STACK = [
    {name: "IBM watsonx.ai", role: "Runs the four indicator models"},
    {name: "IBM Cloud Object Storage", role: "Stores every submitted image"},
    {name: "IBM Code Engine", role: "Hosts the web app and the API"},
    {name: "PostgreSQL", role: "Incidents, decisions, crews and the audit log"},
];

const TEAM = [
    {
        name: "Kayden Ho",
        role: "Project Manager",
        body: "Kept the team on track by running sprint planning and stand-ups, managing the backlog and deadlines, and was the main point of contact with our IBM supervisors.",
        linkedin: "https://www.linkedin.com/in/rattanak-monin-ho-85241620b/",
        photo: "/team/placeholder-kh.svg",
    },
    {
        name: "Aryaveer Singh",
        role: "Business Analyst",
        body: "Defined who EMBERA is for, what it needs to do and how severity is judged.",
        linkedin: "https://www.linkedin.com/in/aryaveer-singh-a8a3a32a7/",
        photo: "/team/aryaveer-singh.png",
    },
    {
        name: "Benjamin Cosentino",
        role: "UX Designer",
        body: "Designed the coordinator's map, incident and ranking screens, and the one-click override.",
        linkedin: "https://www.linkedin.com/in/benjamin-cosentino-a47165308/",
        photo: "/team/benjamin-cosentino.png",
    },
    {
        name: "Liam Robinson Hounsell",
        role: "Developer",
        body: "Built the ingestion pipeline, AI severity models, fire weather and spread estimates, and crew dispatch.",
        linkedin: "https://www.linkedin.com/in/lbrh/",
        photo: "/team/liam-robinson-hounsell.jpeg",
    },
    {
        name: "Htet Myet Aung Win",
        role: "Developer",
        body: "Owns the architecture, cloud deployment and development setup.",
        linkedin: "https://www.linkedin.com/in/htet-myet-aung-win-359a88318/",
        photo: "/team/placeholder-hw.svg",
    },
];

function Arrow() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M9.3 3.7 13.1 7.5H1v1h12.1l-3.8 3.8.7.7 5-5-5-5z"/>
        </svg>
    );
}

function LinkedInIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56z"/>
        </svg>
    );
}

/** The hero's right-hand art: the logo, large. */
function HeroArt() {
    return (
        <div className="lp-hero__art" aria-hidden>
            <LogoMark size={280}/>
        </div>
    );
}

/** A product screenshot (pnpm screenshots), in the theme the browser is using. Its size comes from
 * the capture, so the space is reserved before it loads. */
function Shot({name, alt, priority = false, className = "lp-shot", maxWidth}: {
    name: string;
    alt: string;
    priority?: boolean;
    className?: string;
    maxWidth?: number;
}) {
    const [w, h] = (SHOTS as Record<string, number[]>)[name];
    return (
        <picture>
            <source srcSet={`/product/${name}-dark.webp`} media="(prefers-color-scheme: dark)"/>
            <img
                src={`/product/${name}-light.webp`}
                alt={alt}
                width={w}
                height={h}
                loading={priority ? "eager" : "lazy"}
                className={className}
                style={maxWidth ? {maxWidth} : undefined}
            />
        </picture>
    );
}

/** The front door: what EMBERA is, the three views, and where each page lives. */
export default function Overview() {
    return (
        <div className="app-shell lp">
            <SimpleHeader view="Overview" title="EMBERA | Bushfire situational awareness">
                <nav aria-label="On this page" className="lp-nav-links">
                    <a className="lp-link" href="#how">How it works</a>
                    <a className="lp-link" href="#views">Views</a>
                    <a className="lp-link" href="#capabilities">Capabilities</a>
                    <a className="lp-link" href="#about">About us</a>
                </nav>
                <Link href="/coordinator" className="lp-btn lp-btn--primary lp-btn--sm">
                    View the map <Arrow/>
                </Link>
            </SimpleHeader>

            <main id="main" tabIndex={-1} className="app-main">
                <section className="lp-band lp-band--muted" aria-labelledby="lp-title">
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-5)"}}>
                        <div className="lp-hero">
                            <div style={{display: "flex", flexDirection: "column", gap: "var(--space-5)"}}>
                                <span className="lp-eyebrow">EMBERA - Emergency Monitoring for Bushfire Evaluation, Response and Awareness</span>
                                <h1 id="lp-title" className="lp-display">See every fire. Send the right crew first.</h1>
                                <p className="lp-lede">
                                    EMBERA turns photos from the public, drones, CCTV and satellites into scored, ranked
                                    incidents on one map, so
                                    coordinators can dispatch crews in order of risk.
                                </p>
                                <div className="lp-actions" style={{marginTop: "var(--space-3)"}}>
                                    <Link href="/coordinator" className="lp-btn lp-btn--primary">
                                        Open coordinator view <Arrow/>
                                    </Link>
                                    <Link href="/civilian" className="lp-btn lp-btn--tertiary">
                                        Report a fire <Arrow/>
                                    </Link>
                                </div>
                            </div>
                            <HeroArt/>
                        </div>
                    </div>
                </section>

                <section id="how" className="lp-band" aria-labelledby="lp-how">
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-6)"}}>
                        <h2 id="lp-how" className="lp-h2">From first photo to crews on scene</h2>
                        <ol className="lp-grid-4" style={{listStyle: "none", margin: 0, padding: 0}}>
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

                <section id="views" className="lp-band" aria-labelledby="lp-views">
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-7)"}}>
                        <h2 id="lp-views" className="lp-h2">Built around the people who use it</h2>
                        {PERSONAS.map((p) => (
                            <article key={p.id} className={p.band ? "lp-persona lp-persona--band" : "lp-persona"} aria-labelledby={`lp-${p.id}`}>
                                <div className="lp-persona__text">
                                    <div className="lp-persona__who">
                                        {/* 200px source, shown at 96px (next/image serves the 2x size) */}
                                        <Image src={p.photo} alt={p.photoAlt} width={96} height={96} className="lp-persona__photo"/>
                                        <div style={{display: "flex", flexDirection: "column", gap: "var(--space-1)"}}>
                                            <span className="lp-eyebrow">{p.view}</span>
                                            <h3 id={`lp-${p.id}`} className="lp-h3">
                                                {p.name}
                                            </h3>
                                        </div>
                                    </div>
                                    <p className="lp-body">{p.about}</p>
                                    <ol className="lp-list lp-steps">
                                        {p.flow.map((step, i) => (
                                            <li key={step}>
                                                <span className="data caption">{String(i + 1).padStart(2, "0")}</span>
                                                {step}
                                            </li>
                                        ))}
                                    </ol>
                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                        gap: "var(--space-3)",
                                        marginTop: "var(--space-2)"
                                    }}>
                                        <Link href={p.href} className="lp-btn lp-btn--primary">
                                            Open the {p.view.toLowerCase()} view <Arrow/>
                                        </Link>
                                        <span className="data caption">{p.href}</span>
                                    </div>
                                </div>
                                <div className="lp-persona__shot">
                                    {/* phone captures are 2x pixels: cap them at a phone's width, desktop ones at their own */}
                                    <Shot name={p.shot} alt={p.alt} className="lp-shot"
                                          maxWidth={(SHOTS as Record<string, number[]>)[p.shot][0] < 600 ? 320 : undefined}/>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="lp-band lp-band--muted" aria-label="Key figures">
                    <div className="lp-wrap lp-stats">
                        {STATS.map((s) => (
                            <div key={s.num} className="lp-stat">
                                <span className="lp-stat__num data">{s.num}</span>
                                <span className="lp-body">{s.label}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section id="capabilities" className="lp-band" aria-labelledby="lp-caps">
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-6)"}}>
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
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-6)"}}>
                        <h2 id="lp-stack" className="lp-h2">Built on IBM Cloud</h2>
                        <ul className="lp-grid-4" style={{listStyle: "none", margin: 0, padding: 0}}>
                            {STACK.map((s) => (
                                <li key={s.name} className="lp-stat">
                                    <span className="lp-h3">{s.name}</span>
                                    <span className="lp-body">{s.role}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section id="about" className="lp-band" aria-labelledby="lp-about">
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-6)"}}>
                        <h2 id="lp-about" className="lp-h2">About us</h2>
                        <div className="lp-grid-2">
                            <div className="lp-step">
                                <h3 className="lp-h3">The problem</h3>
                                <p className="lp-lede">
                                    In a major bushfire, photos come in from many sources faster than anyone can sort
                                    them. Every minute a coordinator spends sorting is a minute crews aren&apos;t putting
                                    out fires.
                                </p>
                            </div>
                            <div className="lp-step">
                                <h3 className="lp-h3">Our solution</h3>
                                <p className="lp-lede">
                                    We help bushfire coordinators get crews to the fires that matter most, sooner, so
                                    they spend less time sorting information and more time making decisions.
                                </p>
                                <p className="lp-body">
                                    That&apos;s why we built EMBERA. It turns incoming photos into a live map of fires
                                    ranked by urgency. Each ranking comes with its reason and an estimate of how the
                                    fire could spread. The coordinator makes the final call and can overrule any
                                    ranking.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="lp-band lp-band--muted" aria-labelledby="lp-team">
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-6)"}}>
                        <div style={{display: "flex", flexDirection: "column", gap: "var(--space-3)"}}>
                            <h2 id="lp-team" className="lp-h2">The team</h2>
                            <p className="lp-lede" style={{maxWidth: "none"}}>
                                EMBERA is a 12-week capstone project built for IBM by Team 8. Our supervisors are
                                Naresh Olladapu and Emily Chin.
                            </p>
                        </div>
                        <ul className="lp-team">
                            {TEAM.map((t) => (
                                <li key={t.name} className="lp-member">
                                    <Image src={t.photo} alt={t.name} width={256} height={256}
                                           sizes="(max-width: 671px) 50vw, (max-width: 1055px) 33vw, 256px"
                                           className="lp-member__photo"/>
                                    <span className="lp-tag">{t.role}</span>
                                    <h3 className="lp-h3">{t.name}</h3>
                                    <p className="lp-body">{t.body}</p>
                                    <a href={t.linkedin} target="_blank" rel="noopener noreferrer"
                                       className="lp-link lp-member__link" aria-label={`${t.name} on LinkedIn`}>
                                        <LinkedInIcon/> LinkedIn
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className="lp-band lp-band--inverse" aria-labelledby="lp-next">
                    <div className="lp-wrap" style={{display: "flex", flexDirection: "column", gap: "var(--space-5)"}}>
                        <h2 id="lp-next" className="lp-h2">Take the next step</h2>
                        <p className="lp-lede">Open the coordinator view with demo data, or see what a crew sees in the
                            field.</p>
                        <div className="lp-actions">
                            <Link href="/coordinator" className="lp-btn lp-btn--primary">
                                Open coordinator view <Arrow/>
                            </Link>
                            <Link href="/crew" className="lp-btn lp-btn--ghost-inverse">
                                Open crew view <Arrow/>
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
