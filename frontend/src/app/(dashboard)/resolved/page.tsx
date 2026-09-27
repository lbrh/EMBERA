"use client";

import { useMemo, useState } from "react";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { resolvedList } from "@/lib/store/selectors";
import { SearchFilterBar } from "@/components/primitives/SearchFilterBar";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ResolvedRow } from "@/components/resolved/ResolvedRow";
import { EMPTY_FILTERS, matchesFilters, matchesSearch } from "@/lib/utils/incidentFilters";

// one grid for the whole table (rows are subgrids, see .data-table), so columns line up; below
// 1024px each row is a card and the dt-* cells carry their own labels (layout.css)
const GRID = "auto minmax(160px, 1.2fr) auto auto minmax(180px, 1.5fr) minmax(140px, 1fr) auto";

export default function ResolvedPage() {
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const fullList = resolvedList(incidents, order);
  const list = useMemo(
    () =>
      fullList.filter(
        (i) => matchesSearch(i, search) && matchesFilters(i, filters, "extinguishedAtIso", "extinguishedBy")
      ),
    [fullList, search, filters]
  );
  const isFiltering = search.trim().length > 0 || fullList.length !== list.length;

  return (
    <div className="page">
      <PageHeader
        title="Resolved: extinguished"
        lede="Fires a dispatched crew has reported out. They leave the dispatch order, can be reopened if a later image shows re-ignition, and can be archived once they no longer need watching."
        stat={isFiltering ? `${list.length} of ${fullList.length} resolved this shift` : `${fullList.length} resolved this shift`}
        statTone="ok"
      />

      <div style={{ marginTop: "var(--space-5)" }}>
        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
          dateLabel="Extinguished"
          decidedByLabel="Reported by"
        />
      </div>

      <div className="card data-table" role="table" aria-label="Resolved incidents" style={{ marginTop: "var(--space-4)", gridTemplateColumns: GRID }}>
        <div role="row" className="caption data-table__row data-table__head">
          <span role="columnheader">Incident</span>
          <span role="columnheader">Location</span>
          <span role="columnheader">Peak severity</span>
          <span role="columnheader">Dispatched</span>
          <span role="columnheader">Extinguished</span>
          <span role="columnheader">Reported by</span>
          <span role="columnheader" aria-label="Actions" />
        </div>

        {list.length === 0 ? (
          <p className="caption" style={{ gridColumn: "1 / -1", padding: "var(--space-7) var(--space-5)", fontSize: "var(--text-sm)" }}>
            {fullList.length === 0
              ? "Nothing resolved yet. Dispatch a crew, then mark the incident extinguished from the dispatch order or its detail screen when the crew reports it out."
              : "No resolved incidents match your search or filters."}
          </p>
        ) : (
          list.map((incident) => <ResolvedRow key={incident.id} incident={incident} />)
        )}
      </div>
    </div>
  );
}
