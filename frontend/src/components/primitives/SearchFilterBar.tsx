"use client";

import { useEffect, useRef, useState } from "react";
import type { SeverityBand, SourceType } from "@/lib/types";
import { SEVERITY, SEVERITY_ORDER } from "@/lib/constants/severity";
import { SOURCE_META } from "@/components/primitives/SourceChip";
import { Button } from "@/components/primitives/Button";
import { EMPTY_FILTERS, countActiveFilters, type IncidentFilters, type SeverityFilterValue } from "@/lib/utils/incidentFilters";

const SOURCE_ORDER: SourceType[] = ["drone", "satellite", "citizen", "cctv"];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters: IncidentFilters;
  onFiltersChange: (f: IncidentFilters) => void;
  /** Label for the date-range fields: "Captured" on Archive, "Extinguished" on Resolved. */
  dateLabel: string;
  /** Label for the free-text "who decided" field: "Decided by" / "Reported by". */
  decidedByLabel: string;
  /** Archive also has dismissed (not-a-fire) images, so it gets an extra severity chip. */
  includeNotAFire?: boolean;
}

export function SearchFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search location, coordinates, source, who decided…",
  filters,
  onFiltersChange,
  dateLabel,
  decidedByLabel,
  includeNotAFire = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const activeCount = countActiveFilters(filters);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function set<K extends keyof IncidentFilters>(key: K, value: IncidentFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  const severityOptions: { value: SeverityFilterValue; label: string }[] = [
    ...SEVERITY_ORDER.map((band) => ({ value: band as SeverityFilterValue, label: SEVERITY[band].label })),
    ...(includeNotAFire ? [{ value: "not_a_fire" as SeverityFilterValue, label: "Not a fire" }] : []),
  ];

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: "1 1 280px", minWidth: 220 }}>
        <span
          aria-hidden
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "flex" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="search"
          className="input"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Search"
          style={{ paddingLeft: 36, font: "400 var(--text-sm)/1 var(--font-plex-sans)" }}
        />
      </div>

      <div ref={wrapRef} style={{ position: "relative", flex: "none", marginLeft: "auto" }}>
        <Button variant="secondary" small onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: -2 }}>
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          Filter
          {activeCount > 0 ? (
            <span
              className="data"
              style={{
                marginLeft: 6,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: "var(--radius-full)",
                background: "var(--accent)",
                color: "var(--panel)",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {activeCount}
            </span>
          ) : null}
        </Button>

        {open ? (
          <div
            role="region"
            aria-label="Filter incidents"
            className="card"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: "min(340px, calc(100vw - 32px))",
              maxHeight: "70vh",
              overflowY: "auto",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
              boxShadow: "var(--shadow-pop)",
              zIndex: 40,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ font: "700 var(--text-sm)/1 var(--font-plex-sans)", color: "var(--fg)" }}>Filters</h3>
              <button type="button" className="icon-btn icon-btn--bare" aria-label="Close filters" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <FilterField label="Location name">
              <input
                ref={firstFieldRef}
                type="text"
                className="input"
                value={filters.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. Kinglake"
              />
            </FilterField>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--space-3)" }}>
              <FilterField label="Latitude">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input"
                  value={filters.lat}
                  onChange={(e) => set("lat", e.target.value)}
                  placeholder="-37.52"
                />
              </FilterField>
              <FilterField label="Longitude">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input"
                  value={filters.lng}
                  onChange={(e) => set("lng", e.target.value)}
                  placeholder="145.35"
                />
              </FilterField>
            </div>

            <FilterField label="Severity">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {severityOptions.map((opt) => (
                  <ToggleChip
                    key={opt.value}
                    label={opt.label}
                    pressed={filters.severities.includes(opt.value)}
                    onClick={() => set("severities", toggle(filters.severities, opt.value))}
                  />
                ))}
              </div>
            </FilterField>

            <FilterField label="Source">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SOURCE_ORDER.map((source) => (
                  <ToggleChip
                    key={source}
                    label={SOURCE_META[source].abbr}
                    pressed={filters.sources.includes(source)}
                    onClick={() => set("sources", toggle(filters.sources, source))}
                  />
                ))}
              </div>
            </FilterField>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--space-3)" }}>
              <FilterField label={`${dateLabel} from`}>
                <input
                  type="date"
                  className="input"
                  value={filters.dateFrom}
                  max={filters.dateTo || undefined}
                  onChange={(e) => set("dateFrom", e.target.value)}
                />
              </FilterField>
              <FilterField label={`${dateLabel} to`}>
                <input
                  type="date"
                  className="input"
                  value={filters.dateTo}
                  min={filters.dateFrom || undefined}
                  onChange={(e) => set("dateTo", e.target.value)}
                />
              </FilterField>
            </div>

            <FilterField label={decidedByLabel}>
              <input
                type="text"
                className="input"
                value={filters.decidedBy}
                onChange={(e) => set("decidedBy", e.target.value)}
                placeholder="Name"
              />
            </FilterField>

            <button
              type="button"
              className="btn btn--link"
              disabled={activeCount === 0}
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
              style={{ alignSelf: "flex-start", fontSize: "var(--text-xs)" }}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="label" style={{ color: "var(--muted)", fontSize: 11 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleChip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="chip"
      style={{
        cursor: "pointer",
        color: pressed ? "var(--accent-fg)" : "var(--fg-4)",
        background: pressed ? "var(--accent-soft)" : "var(--surface-2)",
        borderColor: pressed ? "var(--accent-border)" : "var(--border)",
      }}
    >
      {label}
    </button>
  );
}
