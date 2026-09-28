"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getViewingCrew, setViewingCrew } from "@/lib/utils/viewingCrew";
import { COORDINATOR_NAME, setActor } from "@/lib/data-source";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { usePoll } from "@/lib/hooks/usePoll";
import { relativeTime } from "@/lib/utils/time";
import { ASSIGNMENT_LABEL, CREW_TYPE_LABEL } from "@/lib/constants/crews";
import { SEVERITY, SEVERITY_ORDER } from "@/lib/constants/severity";
import type { Crew, CrewType, DecisionLogEntry, Incident, IncidentComment } from "@/lib/types";
import { Button } from "@/components/primitives/Button";
import { SeverityChip } from "@/components/primitives/SeverityChip";
import { SectionHeading } from "@/components/primitives/Card";
import { IncidentImage } from "@/components/detail/IncidentImage";
import { ActivityFeed } from "@/components/detail/ActivityFeed";
import { AssignedCrews } from "@/components/dispatch/AssignedCrews";

const EMPTY_LOGS: DecisionLogEntry[] = [];
const EMPTY_COMMENTS: IncidentComment[] = [];

/** What a response crew sees on their phone: their assignment, the next status step, on-scene
 * actions, photos and the incident's shared activity. Every action is recorded as the crew. */
export default function CrewPage() {
  const crews = useIncidentStore((s) => s.crews);
  const [crewId, setCrewId] = useState<string | null>(getViewingCrew);
  const crew = crews.find((c) => c.id === crewId) ?? null;
  const incident = useIncidentStore((s) => (crew?.assignment ? s.incidents[crew.assignment.incidentId] : undefined));

  // ponytail: "acting as" stands in for each crew's own login; real auth would replace it.
  const actingAs = crew?.label ?? COORDINATOR_NAME;
  useEffect(() => {
    setActor(actingAs);
    return () => setActor(COORDINATOR_NAME);
  }, [actingAs]);

  function pickCrew(id: string) {
    setCrewId(id || null);
    setViewingCrew(id);
  }

  return (
    <div className="page" style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <Link href="/crews" className="btn btn--link" style={{ alignSelf: "flex-start", fontSize: "var(--text-xs)" }}>
          <span aria-hidden>‹</span> All crews
        </Link>
        <h1 className="page-title">Crew view</h1>
        <p className="page-lede">
          What a response crew sees on their phone. Each crew would log in; for the demo, pick which crew you&apos;re viewing as.
        </p>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span className="label">Viewing as</span>
        <select className="input" value={crew?.id ?? ""} onChange={(e) => pickCrew(e.target.value)}>
          <option value="">Pick a crew…</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {c.assignment ? ASSIGNMENT_LABEL[c.assignment.status] : "Available"}
            </option>
          ))}
        </select>
      </label>

      {!crew ? (
        <p className="caption">{crews.length === 0 ? "Loading crews…" : "Pick a crew to see its assignment."}</p>
      ) : !crew.assignment ? (
        <section className="card" style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <h2 style={{ font: "600 var(--text-lg)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>Standing by</h2>
          <p style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg-2)" }}>
            {CREW_TYPE_LABEL[crew.type]} crew at {crew.station.name} station, no assignment. This screen updates by itself when the coordinator dispatches you.
          </p>
        </section>
      ) : !incident ? (
        <p className="caption">Loading your assignment…</p>
      ) : (
        <CrewAssignment crew={crew} incident={incident} />
      )}
    </div>
  );
}

function CrewAssignment({ crew, incident }: { crew: Crew; incident: Incident }) {
  const assignment = crew.assignment!;
  const tick = useIncidentStore((s) => s.clockTick);
  const setCrewStatus = useIncidentStore((s) => s.setCrewStatus);
  const markExtinguished = useIncidentStore((s) => s.markExtinguished);
  const falseAlarm = useIncidentStore((s) => s.falseAlarm);
  const overrideSeverity = useIncidentStore((s) => s.overrideSeverity);
  const decisions = useIncidentStore((s) => s.decisionLogs[incident.id] ?? EMPTY_LOGS);
  const comments = useIncidentStore((s) => s.comments[incident.id] ?? EMPTY_COMMENTS);
  const loadDecisionLog = useIncidentStore((s) => s.loadDecisionLog);
  const loadComments = useIncidentStore((s) => s.loadComments);

  const loadActivity = useCallback(() => {
    loadDecisionLog(incident.id);
    loadComments(incident.id);
  }, [incident.id, loadDecisionLog, loadComments]);
  useEffect(loadActivity, [loadActivity]);
  usePoll(loadActivity);

  const onScene = assignment.status === "on_scene";
  const next =
    assignment.status === "dispatched" ? ({ status: "en_route", label: "We're en route" } as const)
    : assignment.status === "en_route" ? ({ status: "on_scene", label: "We're on scene" } as const)
    : null;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${incident.coords.lat},${incident.coords.lng}`;

  return (
    <>
      <section className="card" style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="data caption">{incident.ref}</span>
            <h2 style={{ font: "700 var(--text-xl)/1.2 var(--font-plex-sans)", color: "var(--fg)" }}>{incident.place}</h2>
            <span className="caption">
              {ASSIGNMENT_LABEL[assignment.status]} {relativeTime(assignment.updatedAtIso, tick)}
            </span>
          </div>
          <SeverityChip band={incident.band} />
        </div>
        <IncidentImage key={incident.file} imageId={incident.file} alt={`Latest image of ${incident.place}`} height={220} />
        <a className="btn btn--secondary" href={directions} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start" }}>
          Directions ↗
        </a>
        {next ? (
          <Button variant="primary" ack onClick={() => setCrewStatus(assignment.id, next.status)} style={{ width: "100%" }}>
            {next.label}
          </Button>
        ) : null}
      </section>

      {onScene ? (
        <section className="card" style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <SectionHeading as="h2" note="You make the call on what's happening here.">
            On scene
          </SectionHeading>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={() => markExtinguished(incident.id)}>
              Fire&apos;s out: mark extinguished
            </Button>
            <Button onClick={() => falseAlarm(incident.id)}>False alarm</Button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <span className="label">Severity</span>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {SEVERITY_ORDER.map((band) => (
                <button
                  key={band}
                  type="button"
                  className="sev-option"
                  aria-pressed={incident.band === band}
                  onClick={() => overrideSeverity(incident.id, band)}
                >
                  <span className="sev-option__dot" style={{ background: SEVERITY[band].fillVar, borderColor: SEVERITY[band].ringVar }} />
                  {SEVERITY[band].label}
                </button>
              ))}
            </div>
          </div>

          <SupportRequestForm crew={crew} incidentId={incident.id} />
        </section>
      ) : null}

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <SectionHeading as="h2">Crews on this fire</SectionHeading>
        <AssignedCrews incidentId={incident.id} readOnly />
      </section>

      <PhotoUpload incident={incident} />

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <SectionHeading as="h2" note="Comments and decisions, shared with the coordinator.">
          Activity
        </SectionHeading>
        <ActivityFeed incidentId={incident.id} decisions={decisions} comments={comments} />
      </section>
    </>
  );
}

function SupportRequestForm({ crew, incidentId }: { crew: Crew; incidentId: string }) {
  const requestSupport = useIncidentStore((s) => s.requestSupport);
  const [crewType, setCrewType] = useState<CrewType | "">("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    if (await requestSupport(incidentId, crew.id, crewType || null, note)) setNote("");
    setSending(false);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <span className="label">Need more help?</span>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <select className="input" aria-label="Crew type needed" value={crewType} onChange={(e) => setCrewType(e.target.value as CrewType | "")} style={{ flex: "1 1 140px" }}>
          <option value="">Any crew</option>
          {(Object.keys(CREW_TYPE_LABEL) as CrewType[]).map((t) => (
            <option key={t} value={t}>
              {CREW_TYPE_LABEL[t]} crew
            </option>
          ))}
        </select>
        <input
          className="input"
          aria-label="Note for the coordinator"
          placeholder="Where, and why (optional)"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: "2 1 200px" }}
        />
      </div>
      <Button type="submit" disabled={sending} style={{ alignSelf: "flex-start" }}>
        {sending ? "Sending…" : "Request support"}
      </Button>
    </form>
  );
}

function PhotoUpload({ incident }: { incident: Incident }) {
  const submitImage = useIncidentStore((s) => s.submitImage);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | string>("idle");

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus("uploading");
    try {
      // The photo is from this fire: filed on this incident at its location, taken now.
      await submitImage({
        file,
        fileName: file.name,
        sourceType: "crew",
        incidentId: incident.id,
        latitude: incident.coords.lat,
        longitude: incident.coords.lng,
        timestamp: new Date().toISOString(),
      });
      setFile(null);
      setStatus("done");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <form onSubmit={upload} className="card card--inset" style={{ padding: "var(--space-4) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <SectionHeading as="h2" note="Scored like any other image. The newest photo rates the fire.">
        Add a photo
      </SectionHeading>
      <input
        key={status === "done" ? "reset" : "file"}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Photo of the fire"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setStatus("idle");
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Button type="submit" disabled={!file || status === "uploading"}>
          {status === "uploading" ? "Uploading…" : "Upload photo"}
        </Button>
        <span className="caption" role="status">
          {status === "done" ? "Uploaded. Its score appears in about 10 s." : status === "idle" || status === "uploading" ? "" : status}
        </span>
      </div>
    </form>
  );
}
