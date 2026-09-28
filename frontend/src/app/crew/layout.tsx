"use client";

import { useEffect, type ReactNode } from "react";
import { SimpleHeader } from "@/components/chrome/Header";
import { SkipLink } from "@/components/chrome/SkipLink";
import { ToastHost } from "@/components/primitives/ToastHost";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { useClock } from "@/lib/hooks/useClock";
import { usePoll } from "@/lib/hooks/usePoll";

/** A response crew's phone: their assignment only, no coordinator tabs or shortcuts. */
export default function CrewLayout({ children }: { children: ReactNode }) {
  const init = useIncidentStore((s) => s.init);
  const refresh = useIncidentStore((s) => s.refresh);

  useEffect(() => {
    init();
  }, [init]);

  useClock();
  usePoll(refresh);

  return (
    <div className="app-shell">
      <SkipLink />
      <SimpleHeader view="Crew" />
      <main id="main" tabIndex={-1} className="app-main">
        {children}
      </main>
      <ToastHost links={false} />
    </div>
  );
}
