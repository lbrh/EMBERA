import type { SourceType } from "@/lib/types";

const SOURCE_META: Record<SourceType, { abbr: string; label: string }> = {
  drone: { abbr: "Drone", label: "Drone or aerial feed" },
  satellite: { abbr: "Satellite", label: "Satellite feed" },
  citizen: { abbr: "Manual", label: "Manual upload" },
  cctv: { abbr: "API", label: "Bulk or API submission" },
  crew: { abbr: "Crew", label: "Photo from a response crew" },
};

export function SourceChip({ source }: { source: SourceType }) {
  const meta = SOURCE_META[source];
  return (
    <span
      className="chip"
      title={`Input source: ${meta.label}`}
      style={{
        color: "var(--fg-4)",
        background: "var(--surface-2)",
        borderColor: "var(--border)",
        fontWeight: 500,
      }}
    >
      {meta.abbr}
    </span>
  );
}

export { SOURCE_META };
