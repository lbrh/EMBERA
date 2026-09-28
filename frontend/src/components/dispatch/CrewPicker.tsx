"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Incident } from "@/lib/types";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { distanceKm } from "@/lib/utils/geo";
import { CREW_TYPE_LABEL } from "@/lib/constants/crews";
import { Button } from "@/components/primitives/Button";

/** Pick one or more available crews to send to an incident. One instance lives in the dashboard
 * layout; any "Dispatch crew" / "Add crew" button opens it with openCrewPicker(incidentId).
 * A native modal <dialog>: focus trap, Esc and the backdrop come from the browser. */
export function CrewPicker() {
  const incidentId = useIncidentStore((s) => s.crewPickerFor);
  const session = useIncidentStore((s) => s.crewPickerSession);
  const incident = useIncidentStore((s) => (s.crewPickerFor ? s.incidents[s.crewPickerFor] : undefined));
  const openCrewPicker = useIncidentStore((s) => s.openCrewPicker);
  const loadCrews = useIncidentStore((s) => s.loadCrews);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (incidentId && !dialog.open) {
      loadCrews(); // who's free may have changed since the last poll
      dialog.showModal();
    } else if (!incidentId && dialog.open) {
      dialog.close();
    }
  }, [incidentId, session, loadCrews]);

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      className="crew-picker"
      aria-labelledby="crew-picker-title"
      onClose={() => openCrewPicker(null)}
      // a click on the backdrop lands on the dialog element itself (the form fills the box)
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* keyed by the opening, so every opening starts with nothing ticked */}
      {incident ? <PickerForm key={session} incident={incident} onDone={close} /> : null}
    </dialog>
  );
}

function PickerForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const crews = useIncidentStore((s) => s.crews);
  const dispatchCrews = useIncidentStore((s) => s.dispatchCrews);
  const [picked, setPicked] = useState<string[]>([]);

  const available = crews
    .filter((c) => !c.assignment)
    .map((crew) => ({ crew, km: distanceKm(crew.station.coords, incident.coords) }))
    .sort((a, b) => a.km - b.km);
  const busy = crews.length - available.length;
  // only crews still free: one can be sent elsewhere by someone else while this is open
  const chosen = picked.filter((id) => available.some((a) => a.crew.id === id));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (chosen.length === 0) return;
    dispatchCrews(incident.id, chosen);
    onDone();
  }

  return (
    <form onSubmit={submit} className="crew-picker__body">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="crew-picker-title" style={{ font: "700 var(--text-lg)/1.2 var(--font-plex-sans)", color: "var(--fg)" }}>
          Dispatch crew · {incident.place}
        </h2>
        <p className="caption">{incident.ref} · nearest first, straight-line distance from each crew&apos;s station.</p>
      </div>

      {available.length === 0 ? (
        <p style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg-2)" }}>
          {crews.length === 0 ? (
            "Loading crews…"
          ) : (
            <>
              Every crew is out. Recall one from another fire on the{" "}
              <Link href="/crews" onClick={onDone}>
                Crews page
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <legend className="label" style={{ marginBottom: "var(--space-2)" }}>
            Available crews
          </legend>
          {available.map(({ crew, km }) => (
            <label key={crew.id} className="crew-option">
              <input
                type="checkbox"
                checked={picked.includes(crew.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, crew.id] : p.filter((id) => id !== crew.id)))}
              />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>{crew.label}</span>
                <span className="caption">
                  {CREW_TYPE_LABEL[crew.type]} · {crew.station.name} station
                </span>
              </span>
              <span className="data" style={{ font: "500 var(--text-sm)/1 var(--font-plex-mono)", color: "var(--fg-2)" }}>
                {km.toFixed(1)} km
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {busy > 0 ? (
        <p className="caption">
          {busy} {busy === 1 ? "crew is" : "crews are"} already out on other incidents.{" "}
          <Link href="/crews" onClick={onDone}>
            See all crews
          </Link>
        </p>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={chosen.length === 0}>
          {chosen.length > 1 ? `Dispatch ${chosen.length} crews` : "Dispatch crew"}
        </Button>
      </div>
    </form>
  );
}
