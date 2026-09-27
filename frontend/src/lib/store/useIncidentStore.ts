"use client";

import { create } from "zustand";
import { currentActor, dataSource, getSeedDecisionLog, getSeedGroup, useMock } from "@/lib/data-source";
import type { SubmitImagePayload } from "@/lib/data-source";
import { SEVERITY, bandFromSum } from "@/lib/constants/severity";
import { THEME_STORAGE_KEY } from "@/lib/constants/theme";
import { crewAsk } from "@/lib/constants/crews";
import { ARCHIVED_REASON } from "@/lib/normalize";
import { preloadImages } from "@/lib/utils/preload";
import type {
  Crew,
  CrewType,
  DecisionLogEntry,
  DispatchState,
  Incident,
  IncidentComment,
  IncidentGroup,
  SeverityBand,
  SupportRequest,
} from "@/lib/types";

export interface Toast {
  id: string;
  title: string;
  body: string;
  severityBand: SeverityBand | 0 | "not_a_fire";
  cta: "undo" | "dismiss" | "none";
  onUndo?: () => void;
  createdAt: number;
}

/** Map page filter by dispatch state: active = awaiting a crew, dispatched = crew on scene. */
export type MapFilter = "all" | "active" | "dispatched" | "extinguished";
export type DispatchFilter = "all" | "awaiting" | "live";

/** Last Leaflet viewport on the Map tab, so returning to it restores where the coordinator was
 * looking instead of re-fitting to every marker. */
export interface MapView {
  center: [number, number];
  zoom: number;
}

interface IncidentStoreState {
  incidents: Record<string, Incident>;
  order: string[]; // insertion order, for stable iteration
  decisionLogs: Record<string, DecisionLogEntry[]>;
  comments: Record<string, IncidentComment[]>;
  crews: Crew[];
  /** Open requests for more help from crews on scene, newest first. */
  supportRequests: SupportRequest[];
  /** Incident the crew picker is open for; null = closed. */
  crewPickerFor: string | null;
  /** Bumped on every opening, so the picker starts with nothing ticked each time. */
  crewPickerSession: number;
  group: IncidentGroup | null;
  toasts: Toast[];

  theme: "dark" | "light";
  clockTick: number;
  keysOpen: boolean;
  mapView: MapView | null;
  /** Incident hovered/focused on either the map or the Active incidents rail; each side
   * highlights it so the two stay visually linked. */
  mapHoverId: string | null;
  /** An image under review the reviewer asked to see on the map ("Locate on map"). Flagged images
   * are never drawn on the map; this one is, as a dashed "under review" pin, until dismissed. */
  mapFocusId: string | null;
  mapFilter: MapFilter;
  dispatchFilter: DispatchFilter;
  alertsPanelOpen: boolean;
  reviewSelectedId: string | null;
  newIncidentId: string | null;
  /** Last top-level tab route visited. Lets pages reached by click-through (incident detail)
   * know which tab to show as active and where "back" should go, instead of assuming Map. */
  lastTabPath: string;

  initialized: boolean;
  loading: boolean;

  init: () => Promise<void>;
  /** Re-reads every incident from the server (live updates). Skips incidents with an action in flight. */
  refresh: () => Promise<void>;
  toggleTheme: () => void;
  /** Adopts the theme the pre-paint script in the root layout already applied. */
  syncThemeFromDocument: () => void;
  tickClock: () => void;
  setKeysOpen: (open: boolean) => void;
  setMapView: (view: MapView) => void;
  setMapHoverId: (id: string | null) => void;
  /** Centres the map on this incident and shows it there, even if it's under review. */
  locateOnMap: (id: string) => void;
  clearMapFocus: () => void;
  setMapFilter: (f: MapFilter) => void;
  setDispatchFilter: (f: DispatchFilter) => void;
  setAlertsPanelOpen: (open: boolean) => void;
  setLastTabPath: (path: string) => void;
  selectReview: (id: string | null) => void;
  dismissToast: (id: string) => void;

  confirmReview: (id: string) => Promise<void>;
  changeReview: (id: string, level: SeverityBand) => Promise<void>;
  discardReview: (id: string) => Promise<void>;
  overrideSeverity: (id: string, level: SeverityBand) => Promise<void>;
  openCrewPicker: (id: string | null) => void;
  loadCrews: () => Promise<void>;
  dispatchCrews: (id: string, crewIds: string[]) => Promise<void>;
  recallCrew: (incidentId: string, assignmentId: string) => Promise<void>;
  /** Crew tab: the crew moves itself along. */
  setCrewStatus: (assignmentId: string, status: "en_route" | "on_scene") => Promise<void>;
  /** Crew tab: no fire here. Marks the image not a fire, archives the incident, frees its crews. */
  falseAlarm: (id: string) => Promise<void>;
  loadSupportRequests: () => Promise<void>;
  /** Resolves true once sent. */
  requestSupport: (incidentId: string, crewId: string, crewType: CrewType | null, note: string) => Promise<boolean>;
  dismissSupportRequest: (id: string) => Promise<void>;
  cancelDispatch: (id: string) => Promise<void>;
  markExtinguished: (id: string) => Promise<void>;
  reopenIncident: (id: string) => Promise<void>;
  archiveIncident: (id: string) => Promise<void>;
  sendToManualReview: (id: string) => Promise<void>;
  restoreFromArchive: (id: string) => Promise<void>;
  /** Folds `sourceId` into `targetId` (reports of the same fire). Resolves true on success. */
  mergeIncidents: (sourceId: string, targetId: string) => Promise<boolean>;
  /** Moves one image of `incidentId` into a new incident; resolves to its id, or null on failure. */
  splitImage: (incidentId: string, imageId: string) => Promise<string | null>;
  confirmGrouping: () => Promise<void>;
  keepGroupSeparate: () => Promise<void>;
  loadDecisionLog: (id: string) => Promise<void>;
  loadComments: (id: string) => Promise<void>;
  /** Resolves true once the comment is saved, false if it failed (a toast says why). */
  addComment: (id: string, body: string) => Promise<boolean>;
  submitImage: (payload: SubmitImagePayload) => Promise<{ ref: string; incidentId: string }>;
}

function bandLabel(band: SeverityBand | 0): string {
  if (!band) return "no severity";
  return `${SEVERITY[band].label} (${band})`;
}

let toastCounter = 0;
// The first load of support requests only fills the list; later ones toast what's new.
let supportLoaded = false;
// Incidents with an optimistic action still waiting on the server: a refresh leaves them alone,
// or the poll could briefly put back the value the click just changed.
const inFlight = new Set<string>();
let logCounter = 0;

export const useIncidentStore = create<IncidentStoreState>((set, get) => {
  function pushLog(incidentId: string, summary: string) {
    const entry: DecisionLogEntry = {
      id: `log-${++logCounter}`,
      incidentId,
      summary,
      who: currentActor(),
      whenIso: new Date().toISOString(),
    };
    set((s) => ({
      decisionLogs: {
        ...s.decisionLogs,
        [incidentId]: [entry, ...(s.decisionLogs[incidentId] ?? [])],
      },
    }));
    return entry.id;
  }

  function pushToast(toast: Omit<Toast, "id" | "createdAt">) {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id, createdAt: Date.now() }] }));
    if (toast.cta !== "none") {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 5000);
    }
    return id;
  }

  function patchIncident(id: string, patch: Partial<Incident>) {
    set((s) => ({
      incidents: { ...s.incidents, [id]: { ...s.incidents[id], ...patch } },
    }));
  }

  function snapshot(id: string): Incident {
    return { ...get().incidents[id] };
  }

  // Runs a coordinator action; a failed backend call becomes a toast instead of an unhandled rejection.
  async function attempt(title: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      pushToast({
        title,
        body: err instanceof Error ? err.message : "The request failed.",
        severityBand: 0,
        cta: "dismiss",
      });
    }
  }

  // Optimistic UI: apply the expected result, log it and toast it straight away, then merge in
  // the server's answer. A failed call rolls the incident back and swaps the toast for an error.
  // ponytail: rollback restores the whole pre-action snapshot, so an action taken while an earlier
  // one is still in flight is reverted with it; roll back per field if that ever bites.
  async function optimistic(
    prev: Incident,
    failTitle: string,
    guess: Partial<Incident>,
    call: () => Promise<Partial<Incident>>,
    log: string,
    toast?: Omit<Toast, "id" | "createdAt">
  ): Promise<void> {
    const id = prev.id;
    inFlight.add(id);
    patchIncident(id, guess);
    const logId = pushLog(id, log);
    const toastId = toast ? pushToast(toast) : null;
    try {
      patchIncident(id, await call());
    } catch (err) {
      patchIncident(id, prev);
      set((s) => ({
        toasts: s.toasts.filter((t) => t.id !== toastId),
        decisionLogs: { ...s.decisionLogs, [id]: (s.decisionLogs[id] ?? []).filter((e) => e.id !== logId) },
      }));
      pushToast({
        title: failTitle,
        body: err instanceof Error ? err.message : "The request failed.",
        severityBand: 0,
        cta: "dismiss",
      });
    } finally {
      inFlight.delete(id);
    }
  }

  // Crews and their support requests change together (dispatch, recall, extinguish, false alarm).
  function syncCrews() {
    get().loadCrews();
    get().loadSupportRequests();
  }

  // Undo = put the store back to the pre-action snapshot now, and the server behind it.
  function undoTo(id: string, prev: Incident, note: string) {
    return () => {
      const current = snapshot(id);
      return optimistic(current, `Undo failed · ${prev.ref}`, prev, async () => {
        await dataSource.undo(prev, current);
        syncCrews(); // undoing a dispatch change can free crews
        return {};
      }, note);
    };
  }

  // Undo for a crew closing a fire (extinguished, false alarm): closing freed every crew on it, so
  // besides putting the incident back, send the same crews back at the step each had reached.
  // Call when the action is taken, before its crews are freed.
  function undoClose(id: string, prev: Incident, note: string) {
    const onFire = get()
      .crews.filter((c) => c.assignment?.incidentId === id)
      .map((c) => ({ crewId: c.id, status: c.assignment!.status }));
    const restoreIncident = undoTo(id, prev, note);
    return async () => {
      await restoreIncident();
      if (onFire.length === 0 || get().incidents[id]?.dispatch !== "live") return; // the undo itself failed
      await attempt(`Couldn't send the crews back · ${prev.ref}`, async () => {
        await dataSource.dispatchCrews(snapshot(id), onFire.map((c) => c.crewId));
        await get().loadCrews();
        for (const { crewId, status } of onFire) {
          const assignmentId = get().crews.find((c) => c.id === crewId)?.assignment?.id;
          if (!assignmentId) continue;
          if (status === "en_route" || status === "on_scene") await dataSource.setCrewStatus(assignmentId, "en_route");
          if (status === "on_scene") await dataSource.setCrewStatus(assignmentId, "on_scene");
        }
      });
      syncCrews();
    };
  }

  return {
    incidents: {},
    order: [],
    decisionLogs: {},
    comments: {},
    crews: [],
    supportRequests: [],
    crewPickerFor: null,
    crewPickerSession: 0,
    group: null,
    toasts: [],

    theme: "light",
    clockTick: 0,
    keysOpen: false,
    mapView: null,
    mapHoverId: null,
    mapFocusId: null,
    mapFilter: "all",
    dispatchFilter: "all",
    alertsPanelOpen: false,
    reviewSelectedId: null,
    newIncidentId: null,
    lastTabPath: "/",

    initialized: false,
    loading: false,

    init: async () => {
      if (get().initialized || get().loading) return;
      set({ loading: true });
      let list: Incident[];
      try {
        list = await dataSource.listIncidents();
      } catch (err) {
        set({ initialized: true, loading: false });
        pushToast({
          title: "Couldn't load incidents",
          body: err instanceof Error ? err.message : "The incident service is unreachable.",
          severityBand: 0,
          cta: "none",
        });
        return;
      }
      const incidents: Record<string, Incident> = {};
      const order: string[] = [];
      for (const incident of list) {
        incidents[incident.id] = incident;
        order.push(incident.id);
      }
      syncCrews();
      if (!useMock) {
        // TODO(api): grouping has no backend endpoint yet.
        set({ incidents, order, initialized: true, loading: false });
        // thumbnails first (list, map hover cards), then the larger previews (incident, review)
        preloadImages([
          ...list.map((i) => dataSource.getImagePreviewUrl(i.file, 240)),
          ...list.map((i) => dataSource.getImagePreviewUrl(i.file, 800)),
        ]);
        return;
      }
      const decisionLogs: Record<string, DecisionLogEntry[]> = {};
      for (const entry of getSeedDecisionLog()) {
        decisionLogs[entry.incidentId] = [
          ...(decisionLogs[entry.incidentId] ?? []),
          entry,
        ].sort((a, b) => (a.whenIso < b.whenIso ? 1 : -1));
      }
      const seedGroup = getSeedGroup();
      set({
        incidents,
        order,
        decisionLogs,
        group: {
          id: seedGroup.id,
          memberIds: seedGroup.memberIds,
          state: seedGroup.state,
          proximityKm: seedGroup.proximityKm,
          windowHours: seedGroup.windowHours,
        },
        initialized: true,
        loading: false,
      });
      // seed dispatch/overlay state that mockApi's listIncidents() doesn't carry
      const { seedOverlay } = await import("@/lib/data-source/mock/seed");
      set((s) => {
        const next = { ...s.incidents };
        for (const [id, overlay] of Object.entries(seedOverlay)) {
          if (!next[id]) continue;
          next[id] = {
            ...next[id],
            dispatch: overlay.dispatch as DispatchState,
            reviewReason: overlay.reviewReason ?? next[id].reviewReason,
            reviewReasonNote: overlay.reviewReasonNote ?? next[id].reviewReasonNote,
            dismissedReason: overlay.dismissedReason ?? next[id].dismissedReason,
            dismissedBy: overlay.dismissedBy ?? next[id].dismissedBy,
            dismissedAtIso: overlay.dismissedAtIso ?? next[id].dismissedAtIso,
            extinguishedNote: overlay.extinguishedNote ?? next[id].extinguishedNote,
            extinguishedBy: overlay.extinguishedBy ?? next[id].extinguishedBy,
            extinguishedAtIso: overlay.extinguishedAtIso ?? next[id].extinguishedAtIso,
            reasonBullets: overlay.reasonBullets ?? next[id].reasonBullets,
            recommendedAction: overlay.recommendedAction ?? next[id].recommendedAction,
            groupId: seedGroup.memberIds.includes(id) ? seedGroup.id : null,
          };
        }
        return { incidents: next };
      });
    },

    toggleTheme: () =>
      set((s) => {
        const next = s.theme === "dark" ? "light" : "dark";
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", next);
          try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
          } catch {
            // storage blocked: the theme still applies for this session
          }
        }
        return { theme: next };
      }),
    syncThemeFromDocument: () =>
      set({
        theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      }),
    tickClock: () => set((s) => ({ clockTick: s.clockTick + 1 })),
    setKeysOpen: (open) => set({ keysOpen: open }),
    setMapView: (mapView) => set({ mapView }),
    setMapHoverId: (mapHoverId) => set({ mapHoverId }),
    locateOnMap: (id) => {
      const incident = get().incidents[id];
      if (!incident) return;
      set({ mapFocusId: id, mapView: { center: [incident.coords.lat, incident.coords.lng], zoom: 13 } });
    },
    clearMapFocus: () => set({ mapFocusId: null }),
    setMapFilter: (mapFilter) => set({ mapFilter }),
    setDispatchFilter: (dispatchFilter) => set({ dispatchFilter }),
    setAlertsPanelOpen: (alertsPanelOpen) => set({ alertsPanelOpen }),
    setLastTabPath: (lastTabPath) => set({ lastTabPath }),
    selectReview: (id) => set({ reviewSelectedId: id }),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    confirmReview: (id) => {
      const prev = snapshot(id);
      // apply the band the AI provisionally read, now that the coordinator has confirmed it
      const band = prev.sum ? bandFromSum(prev.sum) : prev.band;
      return optimistic(
        prev,
        `Couldn't confirm · ${prev.ref}`,
        { flag: "processed", provenance: "ai_confirmed_by_coordinator", band, dispatch: "awaiting" },
        () => dataSource.confirmReview(prev),
        `AI provisional tag confirmed: ${bandLabel(band)}, scored ${prev.sum ?? "–"} of 16`,
        {
          title: `AI tag confirmed · ${prev.ref}`,
          body: "Promoted to an active incident with the provisional score applied.",
          severityBand: band,
          cta: "undo",
          onUndo: undoTo(id, prev, "Reverted to the AI assessment (undo)"),
        }
      );
    },

    changeReview: (id, level) => {
      const prev = snapshot(id);
      return optimistic(
        prev,
        `Couldn't assign severity · ${prev.ref}`,
        { flag: "processed", provenance: "coordinator_assigned", band: level, dispatch: "awaiting" },
        () => dataSource.changeReview(prev, level),
        `Severity assigned manually: ${bandLabel(level)}` +
          (prev.sum ? `. AI had provisionally read ${bandLabel(bandFromSum(prev.sum))}` : ". No AI tag had been applied"),
        {
          title: `Severity assigned manually · ${prev.ref}`,
          body: "Now on the dispatch order, labelled as coordinator-assigned.",
          severityBand: level,
          cta: "undo",
          onUndo: undoTo(id, prev, "Reverted to the AI assessment (undo)"),
        }
      );
    },

    discardReview: (id) => {
      const prev = snapshot(id);
      // advance the reviewer to the next queued item, mirroring the prototype's flow
      const remainingFlagged = get().order.filter(
        (oid) => oid !== id && get().incidents[oid]?.flag === "flagged_review"
      );
      set({ reviewSelectedId: remainingFlagged[0] ?? null });
      return optimistic(
        prev,
        `Couldn't discard · ${prev.ref}`,
        {
          flag: "not_a_fire",
          dismissedReason: "Discarded by reviewer — no fire present in the image.",
          dismissedBy: currentActor(),
          dismissedAtIso: new Date().toISOString(),
        },
        () => dataSource.discardReview(prev),
        "Discarded as not a fire. No fire present in the image.",
        {
          title: `Discarded as not a fire · ${prev.ref}`,
          body: "Off the map and the dispatch order, retrievable in the Archive.",
          severityBand: "not_a_fire",
          cta: "undo",
          onUndo: undoTo(id, prev, "Restored from the archive to manual review (undo)"),
        }
      );
    },

    overrideSeverity: (id, level) => {
      const prev = snapshot(id);
      return optimistic(
        prev,
        `Couldn't override severity · ${prev.ref}`,
        { band: level, provenance: "coordinator_override" },
        () => dataSource.overrideSeverity(prev, level),
        `Severity changed from ${bandLabel(prev.band)} to ${bandLabel(level)}`,
        {
          title: `Severity overridden · ${prev.ref}`,
          body: "Applied and logged as a coordinator decision. The ranking has been recalculated.",
          severityBand: level,
          cta: "undo",
          onUndo: undoTo(id, prev, "Reverted to the AI assessment (undo)"),
        }
      );
    },

    openCrewPicker: (crewPickerFor) =>
      set((s) => ({ crewPickerFor, crewPickerSession: crewPickerFor ? s.crewPickerSession + 1 : s.crewPickerSession })),

    loadCrews: async () => {
      try {
        set({ crews: await dataSource.getCrews() });
      } catch {
        // keep what's shown; the next poll tries again
      }
    },

    dispatchCrews: (id, crewIds) => {
      const prev = snapshot(id);
      const names = get()
        .crews.filter((c) => crewIds.includes(c.id))
        .map((c) => c.label)
        .join(", ");
      return optimistic(
        prev,
        `Couldn't dispatch · ${prev.ref}`,
        { dispatch: "live", flag: "processed" },
        async () => {
          try {
            return await dataSource.dispatchCrews(prev, crewIds);
          } finally {
            syncCrews(); // on success the crews are out; on a clash, show who's really free
          }
        },
        `Dispatched ${names} to ${prev.place}.`,
        {
          title: `Crew dispatched · ${prev.ref}`,
          body: `${names} dispatched to ${prev.place}.`,
          severityBand: prev.band,
          cta: "dismiss",
        }
      );
    },

    setCrewStatus: async (assignmentId, status) => {
      set((s) => ({
        crews: s.crews.map((c) =>
          c.assignment?.id === assignmentId ? { ...c, assignment: { ...c.assignment, status, updatedAtIso: new Date().toISOString() } } : c
        ),
      }));
      await attempt("Status not updated", () => dataSource.setCrewStatus(assignmentId, status));
      syncCrews(); // on failure this puts back the real status
    },

    falseAlarm: (id) => {
      const prev = snapshot(id);
      return optimistic(
        prev,
        `Couldn't report a false alarm · ${prev.ref}`,
        { flag: "not_a_fire", dispatch: "archived", dismissedBy: currentActor(), dismissedAtIso: new Date().toISOString() },
        async () => {
          const result = await dataSource.falseAlarm(prev);
          syncCrews(); // the backend frees every crew on the incident
          return result;
        },
        "False alarm: no fire found. Moved to the Archive.",
        {
          title: `False alarm · ${prev.ref}`,
          body: "No fire found. Moved to the Archive and every crew freed.",
          severityBand: "not_a_fire",
          cta: "undo",
          onUndo: undoClose(id, prev, "False alarm undone. Crews back where they were."),
        }
      );
    },

    loadSupportRequests: async () => {
      let list: SupportRequest[];
      try {
        list = await dataSource.getSupportRequests();
      } catch {
        return; // keep what's shown; the next poll tries again
      }
      const known = new Set(get().supportRequests.map((r) => r.id));
      set({ supportRequests: list });
      if (supportLoaded) {
        for (const r of list) {
          if (known.has(r.id) || r.crewLabel === currentActor()) continue; // the asking crew knows already
          const incident = get().incidents[r.incidentId];
          pushToast({
            title: `Support requested · ${incident?.ref ?? "incident"}`,
            body: `${r.crewLabel} asks for ${crewAsk(r.crewType)}${incident ? ` at ${incident.place}` : ""}.${r.note ? ` "${r.note}"` : ""}`,
            severityBand: incident?.band ?? 0,
            cta: "dismiss",
          });
        }
      }
      supportLoaded = true;
    },

    requestSupport: async (incidentId, crewId, crewType, note) => {
      try {
        await dataSource.requestSupport(incidentId, crewId, crewType, note);
        get().loadSupportRequests();
        pushToast({ title: "Support requested", body: "The coordinator has been alerted.", severityBand: 0, cta: "dismiss" });
        return true;
      } catch (err) {
        pushToast({
          title: "Support request not sent",
          body: err instanceof Error ? err.message : "The request failed.",
          severityBand: 0,
          cta: "dismiss",
        });
        return false;
      }
    },

    dismissSupportRequest: async (id) => {
      set((s) => ({ supportRequests: s.supportRequests.filter((r) => r.id !== id) }));
      await attempt("Couldn't dismiss the request", () => dataSource.dismissSupportRequest(id));
      get().loadSupportRequests();
    },

    recallCrew: (incidentId, assignmentId) => {
      const prev = snapshot(incidentId);
      const crew = get().crews.find((c) => c.assignment?.id === assignmentId);
      // the backend puts an incident back in the order when its last crew is recalled
      const last = get().crews.filter((c) => c.assignment?.incidentId === incidentId).length === 1;
      const back: Partial<Incident> = last ? { dispatch: "awaiting" } : {};
      set((s) => ({ crews: s.crews.map((c) => (c === crew ? { ...c, assignment: null } : c)) }));
      return optimistic(
        prev,
        `Couldn't recall ${crew?.label ?? "crew"} · ${prev.ref}`,
        back,
        async () => {
          try {
            await dataSource.recallCrew(assignmentId);
          } finally {
            syncCrews();
          }
          return last ? { backend: { ...prev.backend, dispatchState: "awaiting" } } : {};
        },
        `Recalled ${crew?.label ?? "crew"}.${last ? " No crew left, back on the dispatch order." : ""}`,
        {
          title: `Crew recalled · ${prev.ref}`,
          body: `${crew?.label ?? "Crew"} stood down.${last ? " No crew left, so the fire is back in the dispatch order." : ""}`,
          severityBand: prev.band,
          cta: "dismiss",
        }
      );
    },

    cancelDispatch: (id) => {
      const prev = snapshot(id);
      return optimistic(
        prev,
        `Couldn't cancel dispatch · ${prev.ref}`,
        { dispatch: "awaiting" },
        async () => {
          const result = await dataSource.cancelDispatch(prev);
          syncCrews(); // the backend frees every crew on the incident
          return result;
        },
        "Dispatch cancelled. Crew stood down, back on the ranked queue.",
        {
          title: `Dispatch cancelled · ${prev.ref}`,
          body: "Crew stood down. Back on the ranked dispatch queue.",
          severityBand: prev.band,
          cta: "dismiss",
        }
      );
    },

    markExtinguished: (id) => {
      const prev = snapshot(id);
      return optimistic(
        prev,
        `Couldn't mark extinguished · ${prev.ref}`,
        {
          dispatch: "extinguished",
          extinguishedNote: "Crew reported the fire out",
          extinguishedBy: currentActor(),
          extinguishedAtIso: new Date().toISOString(),
        },
        async () => {
          const result = await dataSource.markExtinguished(prev);
          syncCrews(); // the backend frees every crew on the incident
          return result;
        },
        "Marked extinguished. Crew reported the fire out.",
        {
          title: `Marked extinguished · ${prev.ref}`,
          body: "Crew reported the fire out. Moved to Resolved.",
          severityBand: prev.band,
          cta: "undo",
          onUndo: undoClose(id, prev, "Reopened. Crews back where they were (undo)"),
        }
      );
    },

    reopenIncident: (id) => {
      const prev = snapshot(id);
      return optimistic(
        prev,
        `Couldn't reopen · ${prev.ref}`,
        { dispatch: "live", extinguishedNote: null, extinguishedBy: null, extinguishedAtIso: null },
        () => dataSource.reopenIncident(prev),
        "Reopened. Back on the dispatch order under Live",
        {
          title: `Reopened · ${prev.ref}`,
          body: "Back on the dispatch order under Live / Dispatched.",
          severityBand: prev.band,
          cta: "undo",
          onUndo: undoTo(id, prev, "Marked extinguished again (undo)"),
        }
      );
    },

    sendToManualReview: (id) => {
      const prev = snapshot(id);
      set({ reviewSelectedId: id });
      return optimistic(
        prev,
        `Couldn't send to review · ${prev.ref}`,
        { flag: "flagged_review", band: 0, dispatch: "unranked", reviewReason: "sent_by_coordinator" },
        () => dataSource.sendToManualReview(prev),
        "Sent to manual review by coordinator. AI tag withdrawn.",
        {
          title: `Sent for a human check · ${prev.ref}`,
          body: "Withdrawn from the map and the dispatch order until reviewed.",
          severityBand: 0,
          cta: "undo",
          onUndo: undoTo(id, prev, "Reverted to the AI assessment (undo)"),
        }
      );
    },

    archiveIncident: (id) => {
      const prev = snapshot(id);
      return optimistic(
        prev,
        `Couldn't archive · ${prev.ref}`,
        {
          dispatch: "archived",
          dismissedReason: ARCHIVED_REASON,
          dismissedBy: currentActor(),
          dismissedAtIso: new Date().toISOString(),
        },
        () => dataSource.archiveIncident(prev),
        "Archived. Extinguished fire filed away",
        {
          title: `Archived · ${prev.ref}`,
          body: "Moved from Resolved to the Archive. Restore it from there if needed.",
          severityBand: prev.band,
          cta: "undo",
          onUndo: undoTo(id, prev, "Restored to Resolved (undo)"),
        }
      );
    },

    restoreFromArchive: (id) => {
      const prev = snapshot(id);
      // an archived fire goes back to Resolved; a dismissed image goes back to manual review
      if (prev.dispatch === "archived") {
        return optimistic(
          prev,
          `Couldn't restore · ${prev.ref}`,
          { dispatch: "extinguished", dismissedReason: null, dismissedBy: null, dismissedAtIso: null },
          async () => {
          const result = await dataSource.markExtinguished(prev);
          syncCrews(); // the backend frees every crew on the incident
          return result;
        },
          "Restored from the archive to Resolved",
          {
            title: `Restored to Resolved · ${prev.ref}`,
            body: "Back on the Resolved list as an extinguished fire.",
            severityBand: prev.band,
            cta: "dismiss",
          }
        );
      }
      set({ reviewSelectedId: id });
      return optimistic(
        prev,
        `Couldn't restore · ${prev.ref}`,
        {
          flag: "flagged_review",
          dispatch: "unranked",
          reviewReason: "restored_not_fire",
          dismissedReason: null,
          dismissedBy: null,
          dismissedAtIso: null,
        },
        () => dataSource.restoreFromArchive(prev),
        "Restored from the archive to manual review",
        {
          title: `Restored for re-check · ${prev.ref}`,
          body: "Back in the manual review queue with its provisional tag intact.",
          severityBand: 0,
          cta: "dismiss",
        }
      );
    },

    refresh: async () => {
      // Mock incidents live only in the store, so re-reading the seed would undo every action.
      if (useMock || !get().initialized) return;
      syncCrews();
      let list: Incident[];
      try {
        list = await dataSource.listIncidents();
      } catch {
        return; // keep what's shown; the next poll tries again
      }
      const added = list.filter((i) => !get().incidents[i.id]);
      // an incident the server no longer has was merged into another one
      const current = new Set(list.map((i) => i.id));
      set((s) => {
        const incidents: Record<string, Incident> = {};
        for (const id of Object.keys(s.incidents)) if (current.has(id) || inFlight.has(id)) incidents[id] = s.incidents[id];
        for (const incident of list) {
          if (!inFlight.has(incident.id)) incidents[incident.id] = incident;
        }
        return { incidents, order: [...added.map((i) => i.id), ...s.order.filter((id) => id in incidents)] };
      });
      preloadImages(added.map((i) => dataSource.getImagePreviewUrl(i.file, 240)));
    },

    loadComments: async (id) => {
      try {
        const comments = await dataSource.getComments(id);
        set((s) => ({ comments: { ...s.comments, [id]: comments } }));
      } catch {
        // keep whatever is already shown; the next poll tries again
      }
    },

    addComment: async (id, body) => {
      try {
        const comment = await dataSource.addComment(id, body);
        set((s) => ({ comments: { ...s.comments, [id]: [comment, ...(s.comments[id] ?? []).filter((c) => c.id !== comment.id)] } }));
        return true;
      } catch (err) {
        pushToast({
          title: "Comment not saved",
          body: err instanceof Error ? err.message : "The request failed.",
          severityBand: 0,
          cta: "dismiss",
        });
        return false;
      }
    },

    loadDecisionLog: async (id) => {
      try {
        const log = await dataSource.getDecisionLog(id);
        if (log) set((s) => ({ decisionLogs: { ...s.decisionLogs, [id]: log } }));
      } catch {
        // keep whatever is already shown; the log is informational
      }
    },

    mergeIncidents: async (sourceId, targetId) => {
      const [source, target] = [get().incidents[sourceId], get().incidents[targetId]];
      try {
        await dataSource.mergeIncidents(sourceId, targetId);
      } catch (err) {
        pushToast({ title: "Couldn't merge", body: err instanceof Error ? err.message : "The request failed.", severityBand: 0, cta: "dismiss" });
        return false;
      }
      pushLog(targetId, `Merged in ${source?.ref ?? "an incident"}`);
      pushToast({
        title: `Merged · ${source?.ref ?? ""} into ${target?.ref ?? ""}`,
        body: "Its images, crews, comments and history are now part of this incident.",
        severityBand: target?.band ?? 0,
        cta: "dismiss",
      });
      await get().refresh();
      await get().loadDecisionLog(targetId);
      return true;
    },

    splitImage: async (incidentId, imageId) => {
      let newId: string;
      try {
        newId = await dataSource.splitImage(imageId);
      } catch (err) {
        pushToast({ title: "Couldn't split", body: err instanceof Error ? err.message : "The request failed.", severityBand: 0, cta: "dismiss" });
        return null;
      }
      await get().refresh();
      const created = get().incidents[newId];
      pushLog(incidentId, `An image was split off into ${created?.ref ?? "a new incident"}`);
      pushToast({
        title: `Split · now ${created?.ref ?? "a new incident"}`,
        body: "That image is its own incident now, with its own review and dispatch.",
        severityBand: created?.band ?? 0,
        cta: "dismiss",
      });
      await get().loadDecisionLog(incidentId);
      return newId;
    },

    confirmGrouping: () =>
      attempt("Couldn't confirm grouping", async () => {
        const group = get().group;
        if (!group) return;
        await dataSource.setGrouping(group.id, "confirmed");
        set((s) => ({ group: s.group ? { ...s.group, state: "confirmed" } : s.group }));
        pushLog(
          group.memberIds[0],
          `Grouping confirmed: ${group.memberIds.length} images treated as one incident (${group.id})`
        );
        pushToast({
          title: `Grouping confirmed · ${group.id}`,
          body: `${group.memberIds.length} images now treated as one incident.`,
          severityBand: 0,
          cta: "undo",
          onUndo: async () => {
            await dataSource.setGrouping(group.id, "kept_separate");
            set((s) => ({ group: s.group ? { ...s.group, state: "suggested" } : s.group }));
          },
        });
      }),

    keepGroupSeparate: () =>
      attempt("Couldn't keep images separate", async () => {
        const group = get().group;
        if (!group) return;
        await dataSource.setGrouping(group.id, "kept_separate");
        set((s) => ({ group: s.group ? { ...s.group, state: "kept_separate" } : s.group }));
        pushLog(
          group.memberIds[0],
          `Grouping rejected. Images kept as separate incidents (${group.id})`
        );
        pushToast({
          title: `Kept separate · ${group.id}`,
          body: "Images kept as separate incidents.",
          severityBand: 0,
          cta: "dismiss",
        });
      }),

    submitImage: async (payload) => {
      const { ref, record } = await dataSource.submitImage(payload);
      const { normalizeIncident } = await import("@/lib/normalize");
      const incident = normalizeIncident(record, {});
      if (get().incidents[incident.id]) {
        // A photo added to a known incident (a crew's): the ingest record carries no dispatch state
        // and isn't scored yet, so re-read the incident instead of overwriting it with that.
        get().refresh();
        return { ref, incidentId: incident.id };
      }
      set((s) => ({
        incidents: { ...s.incidents, [incident.id]: incident },
        order: [incident.id, ...s.order],
        newIncidentId: incident.id,
      }));
      return { ref, incidentId: incident.id };
    },
  };
});
