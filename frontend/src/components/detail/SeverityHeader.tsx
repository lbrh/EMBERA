import type { Incident } from "@/lib/types";
import { CONFIDENCE_THRESHOLD, SEVERITY, needsManualReview } from "@/lib/constants/severity";
import { SeverityDot } from "@/components/primitives/SeverityDot";
import { StatusFlagChip } from "@/components/primitives/StatusFlagChip";
import { SourceChip } from "@/components/primitives/SourceChip";
import { ConfidenceMeter } from "@/components/primitives/ConfidenceMeter";
import { raisedByFireDanger } from "@/lib/utils/spread";

const PROVENANCE_TEXT: Record<Incident["provenance"], (i: Incident) => string> = {
  ai_classified: (i) =>
    `Automated assessment. Scored ${i.sum ?? "–"} of 16, severity ${i.band} of 4${raisedByFireDanger(i) ? " after fire danger" : ""}.`,
  ai_confirmed_by_coordinator: (i) => `AI provisional tag confirmed by a coordinator. Scored ${i.sum ?? "–"} of 16.`,
  coordinator_assigned: () => "Assigned manually by a coordinator, not an AI classification.",
  coordinator_override: (i) => `Coordinator override. The model assessed level ${i.band} of 4.`,
  none: () => "No severity applied. Routed to manual review.",
};

export function SeverityHeader({ incident }: { incident: Incident }) {
  const band = incident.band;
  const tint = band ? `var(--sev${band}-tint)` : "var(--accent-soft)";
  const assessing = incident.reviewReason === "ai_assessing";
  return (
    <div
      className="sev-header"
      style={{
        // a wash of the band's own colour, fading out, so severity reads before any text does
        background: `linear-gradient(180deg, ${tint} 0%, transparent 100%)`,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <SeverityDot band={band} size={64} halo />
      <div className="sev-header__text" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span className="data" style={{ font: "500 var(--text-2xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}>
          {incident.ref} · {incident.place}
        </span>
        <h1
          className="sev-header__title"
          style={{
            color: band ? SEVERITY[band].ringVar : "var(--accent-fg)",
          }}
        >
          {band ? SEVERITY[band].label : assessing ? "AI assessing…" : "Flagged for manual review"}
        </h1>
        <p className="caption">
          {assessing
            ? "The AI is still scoring this image. Severity appears here when it's done."
            : band === 0
              ? PROVENANCE_TEXT.none(incident)
              : PROVENANCE_TEXT[incident.provenance](incident)}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", marginTop: 2 }}>
          <StatusFlagChip flag={incident.flag} dispatch={incident.dispatch} assessing={assessing} />
          <SourceChip source={incident.source} />
        </div>
      </div>

      {incident.confidence != null ? (
        <ConfidenceMeter
          confidence={incident.confidence}
          size="lg"
          note={
            needsManualReview(incident.confidence)
              ? `At or below the ${CONFIDENCE_THRESHOLD} threshold, never auto-classified`
              : `Above the ${CONFIDENCE_THRESHOLD} threshold`
          }
        />
      ) : null}
    </div>
  );
}
