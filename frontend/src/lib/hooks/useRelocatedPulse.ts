"use client";

import { useEffect, useRef, useState } from "react";
import { useIncidentStore } from "@/lib/store/useIncidentStore";

const PULSE_MS = 2000;

/** Pulses a row once it's actually scrolled into view — never on mount, never auto-scrolled to.
 * `incidentId` is watched against the store's `relocatedId`, set whenever a coordinator action
 * (severity change, dispatch, archive, ...) just moved that incident into this list. The first
 * row to spot it hands the baton back via `clearRelocated()`, so nothing else lights up later. */
export function useRelocatedPulse<T extends HTMLElement>(incidentId: string) {
  const relocatedId = useIncidentStore((s) => s.relocatedId);
  const clearRelocated = useIncidentStore((s) => s.clearRelocated);
  const ref = useRef<T>(null);
  const [pulsing, setPulsing] = useState(false);
  const isTarget = relocatedId === incidentId;

  useEffect(() => {
    if (!isTarget) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setPulsing(true);
        clearRelocated();
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isTarget, clearRelocated]);

  // The pulse's own lifetime, kept independent of `isTarget` (which flips false the instant
  // clearRelocated() above runs) so the animation isn't cut short mid-flight.
  useEffect(() => {
    if (!pulsing) return;
    const timer = setTimeout(() => setPulsing(false), PULSE_MS);
    return () => clearTimeout(timer);
  }, [pulsing]);

  return { ref, pulsing };
}
