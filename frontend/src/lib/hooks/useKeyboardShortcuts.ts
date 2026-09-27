"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { TABS } from "@/lib/constants/nav";

const ROUTES = TABS.map((t) => t.href);

/** Alt/Option+1-7 jump to a tab, ←/→ step between tabs, ? opens the shortcut panel, Esc closes
 * it. Matches the redline's keyboard model (section: Geometry, spacing, motion > Focus). */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const keysOpen = useIncidentStore((s) => s.keysOpen);
  const setKeysOpen = useIncidentStore((s) => s.setKeysOpen);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // a modal dialog (the crew picker) owns the keyboard: arrows must not switch screens under it
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          !!target.closest?.("dialog"));

      if (e.key === "Escape") {
        setKeysOpen(false);
        return;
      }
      if (typing) return;

      if (e.key === "?") {
        setKeysOpen(!keysOpen);
        return;
      }
      // Focus follows the route when it starts on a tab, so the focus ring never points at the
      // tab the user just navigated away from.
      const go = (href: string) => {
        router.push(href);
        if (target?.classList.contains("chrome-tab")) {
          document.querySelector<HTMLElement>(`.chrome-tab[href="${href}"]`)?.focus();
        }
      };
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (ROUTES[idx]) go(ROUTES[idx]);
        return;
      }
      // a focused map uses the arrows to pan (Leaflet's keyboard handler), not to switch tabs
      const onMap = target?.closest?.(".leaflet-container");
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !onMap) {
        const currentIdx = ROUTES.findIndex((r) => r === pathname);
        const base = currentIdx === -1 ? 0 : currentIdx;
        const nextIdx =
          e.key === "ArrowRight"
            ? Math.min(ROUTES.length - 1, base + 1)
            : Math.max(0, base - 1);
        go(ROUTES[nextIdx]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, pathname, keysOpen, setKeysOpen]);
}
