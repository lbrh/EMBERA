"use client";

import { useRouter } from "next/navigation";
import type { Incident } from "@/lib/types";
import { Button } from "@/components/primitives/Button";
import { useIncidentStore } from "@/lib/store/useIncidentStore";

// Close enough to see the pin on its own (tier 3 / "site" — see MapCanvas's tierFor), without
// forcing a max zoom that'd hide the tiles around it.
const LOCATE_ZOOM = 14;

export function DetailActionsBar({ incident }: { incident: Incident }) {
  const router = useRouter();
  const openCrewPicker = useIncidentStore((s) => s.openCrewPicker);
  const cancelDispatch = useIncidentStore((s) => s.cancelDispatch);
  const sendToManualReview = useIncidentStore((s) => s.sendToManualReview);
  const archiveIncident = useIncidentStore((s) => s.archiveIncident);
  const setMapView = useIncidentStore((s) => s.setMapView);
  const setLocatedIncidentId = useIncidentStore((s) => s.setLocatedIncidentId);
  const setMapFilter = useIncidentStore((s) => s.setMapFilter);

  const isFlagged = incident.flag === "flagged_review";
  const isLive = incident.dispatch === "live";
  const isExtinguished = incident.dispatch === "extinguished";
  // Only awaiting/live incidents are guaranteed a marker on the map (mapMarkers excludes
  // everything else), so this is scoped to incidents that are actually on the dispatch order.
  const isOnDispatchOrder = incident.dispatch === "awaiting" || isLive;

  function locateOnMap() {
    setMapFilter("all");
    setMapView({ center: [incident.coords.lat, incident.coords.lng], zoom: LOCATE_ZOOM });
    setLocatedIncidentId(incident.id);
    router.push("/coordinator");
  }

  // one slot walks the lifecycle: dispatch -> (live, no primary action) -> archive
  // one slot walks the lifecycle: dispatch -> (the crew marks it extinguished) -> archive
  const primary = isLive
    ? null
    : isExtinguished
      ? { label: "Archive", run: () => archiveIncident(incident.id), ack: true }
      : incident.dispatch === "archived"
        ? null
        : // opens the crew picker, so no ✓: nothing has happened yet
          { label: "Dispatch crew", run: () => openCrewPicker(incident.id), disabled: incident.band === 0, ack: false };

  return (
    <div className="detail-actions" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      {/* one slot for every label, so the button that was clicked shows its ✓ and then the next step */}
      {primary ? (
        <Button variant="primary" ack={primary.ack} disabled={"disabled" in primary ? primary.disabled : false} onClick={primary.run}>
          {primary.label}
        </Button>
      ) : null}
      {isLive ? (
        <Button variant="secondary" ack onClick={() => cancelDispatch(incident.id)}>
          Cancel dispatch
        </Button>
      ) : null}
      <Button
        variant="secondary"
        ack={!isFlagged}
        onClick={() => (isFlagged ? router.push("/coordinator/review") : sendToManualReview(incident.id))}
      >
        {isFlagged ? "Open in manual review" : "Send to manual review"}
      </Button>
      <Button variant="secondary" onClick={() => router.push("/coordinator/dispatch")}>
        View in dispatch order
      </Button>
      {isOnDispatchOrder ? (
        <Button variant="secondary" onClick={locateOnMap}>
          Locate on map
        </Button>
      ) : null}
    </div>
  );
}
