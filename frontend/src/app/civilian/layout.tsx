"use client";

import type { ReactNode } from "react";
import { SimpleHeader } from "@/components/chrome/Header";
import { SkipLink } from "@/components/chrome/SkipLink";

/** The public reporting screen: no incident data is loaded, only the upload form. */
export default function CivilianLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <SkipLink />
      <SimpleHeader view="Report a fire" />
      <main id="main" tabIndex={-1} className="app-main">
        {children}
      </main>
    </div>
  );
}
