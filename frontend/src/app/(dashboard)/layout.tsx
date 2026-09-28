"use client";

import { useEffect, type ReactNode } from "react";
import { Header } from "@/components/chrome/Header";
import { ShortcutPanel } from "@/components/chrome/ShortcutPanel";
import { CrewPicker } from "@/components/dispatch/CrewPicker";
import { SkipLink } from "@/components/chrome/SkipLink";
import { ToastHost } from "@/components/primitives/ToastHost";
import { RouteSkeleton } from "@/components/primitives/RouteSkeleton";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { useClock } from "@/lib/hooks/useClock";
import { usePoll } from "@/lib/hooks/usePoll";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { useTrackLastTabPath } from "@/lib/hooks/useTrackLastTabPath";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const init = useIncidentStore((s) => s.init);
  const initialized = useIncidentStore((s) => s.initialized);
  const syncThemeFromDocument = useIncidentStore((s) => s.syncThemeFromDocument);
  const refresh = useIncidentStore((s) => s.refresh);

  useEffect(() => {
    syncThemeFromDocument();
    init();
  }, [init, syncThemeFromDocument]);

  useClock();
  usePoll(refresh);
  useKeyboardShortcuts();
  useTrackLastTabPath();

  return (
    <div className="app-shell">
      <SkipLink />
      <Header />
      <main id="main" tabIndex={-1} className="app-main">
        {initialized ? children : <RouteSkeleton />}
      </main>
      <ShortcutPanel />
      <CrewPicker />
      <ToastHost />
    </div>
  );
}
