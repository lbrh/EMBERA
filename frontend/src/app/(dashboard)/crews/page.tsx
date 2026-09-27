"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { relativeTime } from "@/lib/utils/time";
import { setViewingCrew } from "@/lib/utils/viewingCrew";
import { ASSIGNMENT_LABEL, CREW_TYPE_LABEL } from "@/lib/constants/crews";
import type { Crew } from "@/lib/types";
import { Button } from "@/components/primitives/Button";
import { SeverityDot } from "@/components/primitives/SeverityDot";

type Filter = "all" | "out" | "available";

/** Every crew, grouped by station: available, or which fire it's on and at what step. The place
 * to find a crew to recall when the picker says every crew is out. */
export default function CrewsPage() {
  const crews = useIncidentStore((s) => s.crews);
  const [filter, setFilter] = useState<Filter>("all");

  const out = crews.filter((c) => c.assignment);
  const counts: Record<Filter, number> = { all: crews.length, out: out.length, available: crews.length - out.length };
  const shown = crews.filter((c) => (filter === "all" ? true : filter === "out" ? c.assignment : !c.assignment));
  const stations = [...new Set(shown.map((c) => c.station.name))];

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <h1 className="page-title">Crews</h1>
          <p className="page-lede">
            {counts.out} of {counts.all} crews out. Recall one here to free it for another fire.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Filter crews">
          {(["all", "out", "available"] as const).map((key) => (
            <button key={key} type="button" className="seg__btn" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === "all" ? "All" : key === "out" ? "Out" : "Available"}
              <span className="seg__count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {crews.length === 0 ? (
        <p className="caption" style={{ marginTop: "var(--space-5)" }}>
          Loading crews…
        </p>
      ) : shown.length === 0 ? (
        <p className="caption" style={{ marginTop: "var(--space-5)" }}>
          {filter === "available" ? "Every crew is out." : "No crew is out right now."}
        </p>
      ) : (
        stations.map((station) => (
          <section key={station} className="card" style={{ marginTop: "var(--space-5)", overflow: "hidden" }} aria-label={`${station} station`}>
            <h2 className="caption crews-station">{station} station</h2>
            {shown
              .filter((c) => c.station.name === station)
              .map((crew) => (
                <CrewRow key={crew.id} crew={crew} />
              ))}
          </section>
        ))
      )}
    </div>
  );
}

function CrewRow({ crew }: { crew: Crew }) {
  const router = useRouter();
  const incident = useIncidentStore((s) => (crew.assignment ? s.incidents[crew.assignment.incidentId] : undefined));
  const tick = useIncidentStore((s) => s.clockTick);
  const recallCrew = useIncidentStore((s) => s.recallCrew);
  const a = crew.assignment;

  return (
    <div className="crews-row">
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 180px", minWidth: 0 }}>
        <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>{crew.label}</span>
        <span className="caption">{CREW_TYPE_LABEL[crew.type]}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2) var(--space-3)", flex: "2 1 260px", minWidth: 0 }}>
        {a ? (
          <>
            <span className="chip chip--pill crew-chip" style={{ flex: "none", whiteSpace: "nowrap" }}>
              {ASSIGNMENT_LABEL[a.status]} · {relativeTime(a.updatedAtIso, tick)}
            </span>
            {incident ? (
              // drops below the status chip when there isn't room for a readable name
              <Link href={`/incident/${incident.id}`} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: "1 1 180px", minWidth: 0, color: "var(--fg)" }}>
                <SeverityDot band={incident.band} size={18} numeral={false} />
                <span style={{ font: "500 var(--text-sm)/1.3 var(--font-plex-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {incident.place}
                </span>
                <span className="data caption" style={{ flex: "none" }}>
                  {incident.ref}
                </span>
              </Link>
            ) : (
              <span className="caption">Incident loading…</span>
            )}
          </>
        ) : (
          <span className="chip chip--pill" style={{ color: "var(--fg-2)", background: "var(--surface-2)", borderColor: "var(--border)" }}>
            Available
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", marginLeft: "auto" }}>
        {a ? (
          <Button small onClick={() => recallCrew(a.incidentId, a.id)}>
            Recall
          </Button>
        ) : null}
        <Button
          small
          variant="link"
          onClick={() => {
            setViewingCrew(crew.id);
            router.push("/crew");
          }}
        >
          Crew view
        </Button>
      </div>
    </div>
  );
}
