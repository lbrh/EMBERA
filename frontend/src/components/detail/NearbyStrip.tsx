"use client";

import { useRouter } from "next/navigation";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { nearby } from "@/lib/store/selectors";
import { SeverityDot } from "@/components/primitives/SeverityDot";
import { SectionHeading } from "@/components/primitives/Card";

export function NearbyStrip({ currentId }: { currentId: string }) {
  const router = useRouter();
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const items = nearby(incidents, order, currentId, 3);

  if (items.length === 0) return null;

  return (
    <section
      className="nearby-strip"
      style={{
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <SectionHeading as="h2">Nearby incidents</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            className="card card--interactive"
            onClick={() => router.push(`/incident/${i.id}`)}
            style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)" }}
          >
            <SeverityDot band={i.band} size={28} />
            <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <span
                style={{
                  font: "600 var(--text-sm)/1.25 var(--font-plex-sans)",
                  color: "var(--fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {i.place}
              </span>
              <span className="data" style={{ font: "400 var(--text-2xs)/1 var(--font-plex-mono)", color: "var(--muted)" }}>
                {i.ref}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
