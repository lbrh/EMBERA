import type { Incident } from "@/lib/types";
import { SEVERITY, SEVERITY_ORDER } from "@/lib/constants/severity";
import { ElementScoreRows } from "@/components/primitives/ElementScoreRows";
import { SectionHeading } from "@/components/primitives/Card";
import { SEVERE_FFDI, compass, dangerRating, raisedByFireDanger } from "@/lib/utils/spread";

export function HowScoredExplainer({ incident }: { incident: Incident }) {
  const isFire = incident.flag !== "not_a_fire";
  const coordinatorAssigned = incident.provenance === "coordinator_assigned";
  const scoreState = coordinatorAssigned ? "Coordinator" : incident.sum ? "Scored" : "Not scored";
  const weather = incident.weather;
  const severe = weather != null && weather.ffdi >= SEVERE_FFDI;
  const raised = raisedByFireDanger(incident);

  return (
    <section className="card card--inset" style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <SectionHeading as="h2">How this severity was scored</SectionHeading>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
        <StepTile step={1} title="Fire or not a fire" result={isFire ? "Fire" : "Not a fire"} ok={isFire} />
        <StepTile step={2} title="Severity score" result={scoreState} ok={scoreState === "Scored"} />
        <StepTile step={3} title="Fire weather" result={weather ? (raised ? "+1 level" : "No change") : "No data"} ok={weather != null} />
      </ol>

      {weather ? (
        <p style={{ margin: 0, font: "400 var(--text-sm)/var(--lh-body) var(--font-plex-sans)", color: "var(--fg-2)" }}>
          Fire danger <strong>{dangerRating(weather.ffdi)}</strong> (FFDI {weather.ffdi}): {Math.round(weather.temperatureC)}°C,{" "}
          {Math.round(weather.humidityPct)}% humidity, wind {Math.round(weather.windKmh)} km/h from {compass(weather.windFromDeg)}.{" "}
          {raised
            ? "At Severe or above the fire can outrun direct attack, so the image's score was raised one level."
            : severe
              ? "Severe or above adds a level to the image's score, up to 4; not applied here."
              : "Below Severe, so the score is the image's alone."}
        </p>
      ) : null}

      <ElementScoreRows elements={incident.elements} sum={incident.sum} coordinatorAssigned={coordinatorAssigned} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span className="label" style={{ color: "var(--muted)" }}>
          Score bands
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-2)" }}>
          {SEVERITY_ORDER.slice()
            .reverse()
            .map((band) => {
              const meta = SEVERITY[band];
              const active = incident.band === band;
              return (
                <div
                  key={band}
                  aria-current={active ? "true" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "8px 10px",
                    borderRadius: "var(--radius-md)",
                    background: active ? "var(--panel)" : "transparent",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                    boxShadow: active ? "0 0 0 1px var(--accent), var(--shadow-xs)" : "none",
                  }}
                >
                  <span
                    aria-hidden
                    style={{ width: 16, height: 16, borderRadius: "50%", background: meta.fillVar, border: `1px solid ${meta.ringVar}`, flex: "none" }}
                  />
                  <span style={{ font: `${active ? 600 : 500} var(--text-xs)/1.3 var(--font-plex-sans)`, color: active ? "var(--fg)" : "var(--fg-4)" }}>
                    {meta.label}
                  </span>
                  <span className="data" style={{ marginLeft: "auto", font: "500 var(--text-2xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}>
                    {meta.sumRange[0]}–{meta.sumRange[1]}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}

function StepTile({ step, title, result, ok }: { step: number; title: string; result: string; ok: boolean }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "var(--panel)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        className="data"
        aria-label={`Step ${step}`}
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "600 var(--text-2xs)/1 var(--font-plex-mono)",
          color: "var(--accent-fg)",
          background: "var(--accent-soft)",
        }}
      >
        {step}
      </span>
      <span style={{ font: "500 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg-2)", flex: 1 }}>{title}</span>
      <span
        className="chip chip--pill"
        style={
          ok
            ? { color: "var(--ok-fg)", background: "var(--ok-soft)", borderColor: "var(--ok-border)" }
            : { color: "var(--muted)", background: "var(--surface-2)", borderColor: "var(--border)" }
        }
      >
        {result}
      </span>
    </li>
  );
}
