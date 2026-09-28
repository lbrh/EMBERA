import type { BaseLayerId } from "@/components/map/MapCanvas";

const OPTIONS: { id: BaseLayerId; label: string }[] = [
  { id: "street", label: "Map" },
  { id: "satellite", label: "Satellite" },
];

/** Base tile layer picker, styled like the dispatch/review segmented filters. Sits at the
 * map's bottom right. */
export function MapLayerControl({ active, onChange }: { active: BaseLayerId; onChange: (id: BaseLayerId) => void }) {
  return (
    <div className="seg" role="group" aria-label="Map layer" style={{ boxShadow: "var(--shadow-pop)" }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className="seg__btn"
          aria-pressed={active === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
