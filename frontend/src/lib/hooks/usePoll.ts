"use client";

import { useEffect } from "react";

/** How often the app re-reads the server for live updates. */
export const POLL_MS = 5_000;

/** Calls `fn` every POLL_MS while the tab is visible, and once as soon as it becomes visible again,
 * so a background tab doesn't spend the rate limit. Pass a stable `fn` (useCallback or a store action).
 * ponytail: plain polling; SSE + Postgres LISTEN/NOTIFY if 5 s ever feels slow (docs/live/dispatch-crews.md §9). */
export function usePoll(fn: () => void) {
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") fn();
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fn]);
}
