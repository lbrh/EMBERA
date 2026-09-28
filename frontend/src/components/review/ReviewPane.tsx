"use client";

import type {ReactNode} from "react";
import {useRouter} from "next/navigation";
import type {Incident, SeverityBand} from "@/lib/types";
import {CONFIDENCE_THRESHOLD, SEVERITY, SEVERITY_ORDER, bandFromSum} from "@/lib/constants/severity";
import {HatchBanner} from "@/components/primitives/HatchBanner";
import {ConfidenceMeter} from "@/components/primitives/ConfidenceMeter";
import {MetaList} from "@/components/primitives/MetaField";
import {ElementScoreRows} from "@/components/primitives/ElementScoreRows";
import {RubricExplainer} from "@/components/primitives/RubricExplainer";
import {Button, useAck} from "@/components/primitives/Button";
import {SectionHeading} from "@/components/primitives/Card";
import {useIncidentStore} from "@/lib/store/useIncidentStore";
import {formatClock, relativeTime} from "@/lib/utils/time";
import {IncidentImage} from "@/components/detail/IncidentImage";

const HEADLINE: Record<string, string> = {
    below_threshold: "Flagged for manual review",
    sent_by_coordinator: "Sent for a human check",
    restored_not_fire: "Restored for re-check",
    restored_discarded: "Restored for re-check",
    no_fire_detected: "No smoke or flame detected",
    ai_assessing: "AI is assessing this image",
};

export function ReviewPane({incident}: { incident: Incident }) {
    const router = useRouter();
    const confirmReview = useIncidentStore((s) => s.confirmReview);
    const changeReview = useIncidentStore((s) => s.changeReview);
    const discardReview = useIncidentStore((s) => s.discardReview);
    const locateOnMap = useIncidentStore((s) => s.locateOnMap);
    const tick = useIncidentStore((s) => s.clockTick);
    const [ackedBand, ackBand] = useAck<SeverityBand>();

    const provisionalBand = incident.sum ? bandFromSum(incident.sum) : null;
    const headline = HEADLINE[incident.reviewReason ?? "below_threshold"];

    return (
        // a size container: its columns rearrange by the pane's own width (layout.css)
        <div className="review-pane">
            <HatchBanner className="review-pane__banner">
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--space-5)",
                    flexWrap: "wrap"
                }}>
                    <div style={{display: "flex", alignItems: "center", gap: "var(--space-5)", flexWrap: "wrap"}}>
            <span
                aria-hidden
                className="review-pane__mark"
                style={{
                    width: 48,
                    height: 48,
                    flex: "none",
                    borderRadius: "50%",
                    border: "2px dashed var(--accent)",
                    background: "var(--panel)",
                    boxShadow: "var(--shadow-card)",
                    alignItems: "center",
                    justifyContent: "center",
                    font: "700 20px/1 var(--font-plex-sans)",
                    color: "var(--accent)",
                }}
            >
              ?
            </span>
                        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
                            <h1 className="page-title">{headline}</h1>
                            <p className="caption">
                                {incident.reviewReason === "ai_assessing"
                                    ? "Scoring smoke, flame, vegetation and infrastructure. This updates on its own when done."
                                    : incident.reviewReason === "below_threshold"
                                    ? "The provisional AI tag is not applied. Awaiting your decision."
                                    : incident.reviewReason === "no_fire_detected"
                                        ? "The models rated smoke and flame both at level 1. Confirm it's a fire, or discard it."
                                        : "Routed by a coordinator. Awaiting your decision."}
                            </p>
                        </div>
                        {incident.confidence != null ? (
                            <ConfidenceMeter confidence={incident.confidence} size="lg"
                                             note={incident.confidence <= CONFIDENCE_THRESHOLD
                                                 ? `At or below the ${CONFIDENCE_THRESHOLD} threshold`
                                                 : `Above the ${CONFIDENCE_THRESHOLD} threshold`}/>
                        ) : null}
                    </div>
                    <span className="data"
                          style={{font: "600 var(--text-xs)/1 var(--font-plex-mono)", color: "var(--muted)"}}>
            {incident.ref}
          </span>
                </div>
            </HatchBanner>

            <div className="review-grid">
                <div className="review-grid__media">
                    <div style={{display: "flex", flexDirection: "column", gap: "var(--space-3)"}}>
                        <IncidentImage key={incident.file} imageId={incident.file}
                                       alt={`Field image for ${incident.place}`}/>
                        <span className="caption" style={{fontSize: 12}}>
                            Unmodified, as received from the field.
                        </span>
                    </div>

                    <div className="review-grid__meta">
                    <MetaList
                        rows={[
                            {
                                label: "Geotag",
                                value: `${incident.coords.lat.toFixed(4)}, ${incident.coords.lng.toFixed(4)}`,
                                mono: true
                            },
                            {label: "Place", value: incident.place},
                            {
                                label: "Captured",
                                value: `${formatClock(incident.capturedAtIso)}, ${relativeTime(incident.capturedAtIso, tick)}`
                            },
                            {label: "Status", value: "Flagged, held out of ranking"},
                            {label: "Class label", value: "Uncertain, not confirmed"},
                            {label: "Priority", value: "Not ranked until reviewed"},
                            {label: "Group", value: incident.groupId ?? "None", mono: !!incident.groupId},
                        ]}
                    />
                    </div>
                </div>

                <div style={{display: "flex", flexDirection: "column", gap: "var(--space-4)"}}>
                    <section className="card card--pending" style={{
                        padding: "var(--space-5)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--space-4)"
                    }}>
                        <SectionHeading note="Shown for review. Not applied to the map or the dispatch order.">AI
                            provisional tag</SectionHeading>
                        {provisionalBand ? (
                            <div style={{display: "flex", alignItems: "center", gap: "var(--space-3)"}}>
                <span
                    aria-hidden
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: SEVERITY[provisionalBand].fillVar,
                        border: `2px dashed ${SEVERITY[provisionalBand].ringVar}`,
                        opacity: 0.75,
                        flex: "none",
                    }}
                />
                                <div style={{display: "flex", flexDirection: "column", gap: 2}}>
                  <span style={{
                      font: "700 var(--text-lg)/1.2 var(--font-plex-sans)",
                      letterSpacing: "var(--tracking-tight)",
                      color: "var(--fg)"
                  }}>
                    {SEVERITY[provisionalBand].label}
                  </span>
                                    <span className="caption">Provisional, level {provisionalBand} of 4</span>
                                </div>
                            </div>
                        ) : (
                            <p className="caption">No element scores were produced for this image.</p>
                        )}
                        <ElementScoreRows elements={incident.elements} sum={incident.sum}/>
                    </section>

                    <section className="card card--pending" style={{
                        padding: "var(--space-5)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--space-2)"
                    }}>
                        <SectionHeading>Reason for flagging</SectionHeading>
                        <p style={{
                            font: "400 var(--text-sm)/var(--lh-body) var(--font-plex-sans)",
                            color: "var(--fg-2)",
                            maxWidth: "72ch"
                        }}>
                            {incident.explanation ??
                                `Confidence ${incident.confidence?.toFixed(2)} is at or below the fixed ${CONFIDENCE_THRESHOLD} threshold, so this image was held out of the ranking rather than force-classified.`}
                        </p>
                    </section>

                    <section className="card decision-card" style={{
                        padding: "var(--space-5)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--space-5)"
                    }}>
                        <SectionHeading as="h2"
                                        note="Each action applies immediately and is logged with your ID and the time.">
                            Your decision
                        </SectionHeading>

                        <DecisionBlock
                            label="Confirm the AI tag"
                            description="Applies the provisional level as final and promotes this image to an active incident."
                        >
                            <Button
                                variant="primary"
                                ack
                                disabled={!provisionalBand}
                                onClick={() => confirmReview(incident.id)}
                            >
                                {provisionalBand ? `Confirm ${SEVERITY[provisionalBand].label}, level ${provisionalBand}` : "Confirm"}
                            </Button>
                        </DecisionBlock>

                        <DecisionBlock label="Change the severity and promote"
                                       description="Recorded as a coordinator decision, not an AI classification.">
                            <div style={{display: "flex", gap: "var(--space-2)", flexWrap: "wrap"}}>
                                {SEVERITY_ORDER.map((band: SeverityBand) => (
                                    <div key={band} style={{display: "flex", alignItems: "center", gap: 6}}>
                                        <button
                                            type="button"
                                            className={ackedBand === band ? "sev-option ack" : "sev-option"}
                                            onClick={() => {
                                                ackBand(band);
                                                changeReview(incident.id, band);
                                            }}
                                        >
                                            <span className="ack__label">
                                                <span className="sev-option__dot" style={{
                                                    background: SEVERITY[band].fillVar,
                                                    borderColor: SEVERITY[band].ringVar
                                                }}/>
                                                {SEVERITY[band].label}
                                            </span>
                                        </button>
                                        <RubricExplainer band={band}/>
                                    </div>
                                ))}
                            </div>
                        </DecisionBlock>

                        <DecisionBlock
                            label="Discard as not a fire"
                            description="Removes it from the map and the dispatch order. The image stays retrievable in the Archive."
                        >
                            <Button variant="secondary" ack onClick={() => discardReview(incident.id)}>
                                Discard as not a fire
                            </Button>
                        </DecisionBlock>
                    </section>

                    {/* ponytail: "Request second image" removed until there's a camera/drone integration to ask */}
                    <div style={{display: "flex", gap: "var(--space-2)", flexWrap: "wrap"}}>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                locateOnMap(incident.id);
                                router.push("/coordinator");
                            }}
                        >
                            Locate on map
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DecisionBlock({
                           label,
                           description,
                           children,
                       }: {
    label: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <div
            className="decision-block"
            style={{
                paddingTop: "var(--space-4)",
                borderTop: "1px solid var(--border)",
            }}
        >
            <div style={{display: "flex", flexDirection: "column", gap: 2}}>
                <h3 style={{font: "600 var(--text-sm)/1.35 var(--font-plex-sans)", color: "var(--fg)"}}>{label}</h3>
                <p className="caption">{description}</p>
            </div>
            <div>{children}</div>
        </div>
    );
}
