"use client";

import { useMemo, useState } from "react";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { archiveList } from "@/lib/store/selectors";
import { SearchFilterBar } from "@/components/primitives/SearchFilterBar";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ArchiveRow } from "@/components/archive/ArchiveRow";
import { EMPTY_FILTERS, matchesFilters, matchesSearch } from "@/lib/utils/incidentFilters";

// one grid for the whole table (rows are subgrids, see .data-table), so columns line up; below
// 1024px each row is a card and the dt-* cells carry their own labels (layout.css)
const GRID = "auto minmax(160px, 1.2fr) auto auto minmax(200px, 2fr) minmax(140px, 1fr) auto";

export default function ArchivePage() {
  const incidents = useIncidentStore((s) => s.incidents);
  const order = useIncidentStore((s) => s.order);
  const tick = useIncidentStore((s) => s.clockTick);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const fullList = archiveList(incidents, order);
  const list = useMemo(
    () =>
      fullList.filter(
        (i) => matchesSearch(i, search) && matchesFilters(i, filters, "capturedAtIso", "dismissedBy")
      ),
    [fullList, search, filters]
  );
  const isFiltering = search.trim().length > 0 || fullList.length !== list.length;

  return (
    <div className="page">
      <PageHeader
        title="Archive"
        lede="Images dismissed as not a fire, and extinguished fires filed away from Resolved. Nothing is deleted, and every record can be restored."
        stat={isFiltering ? `${list.length} of ${fullList.length} retained for audit` : `${fullList.length} retained for audit`}
      />

      <div style={{ marginTop: "var(--space-5)" }}>
        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
          dateLabel="Captured"
          decidedByLabel="Decided by"
          includeNotAFire
        />
      </div>

      <div className="card data-table" role="table" aria-label="Archived images" style={{ marginTop: "var(--space-4)", gridTemplateColumns: GRID }}>
        <div role="row" className="caption data-table__row data-table__head">
          <span role="columnheader">Incident</span>
          <span role="columnheader">Location</span>
          <span role="columnheader">Source</span>
          <span role="columnheader">Captured</span>
          <span role="columnheader">Why archived</span>
          <span role="columnheader">Decided by</span>
          <span role="columnheader" aria-label="Actions" />
        </div>

        {list.length === 0 ? (
          <p className="caption" style={{ gridColumn: "1 / -1", padding: "var(--space-7) var(--space-5)", fontSize: "var(--text-sm)" }}>
            {fullList.length === 0
              ? "Nothing archived yet. Images discarded as not a fire, and extinguished fires archived from Resolved, are listed here."
              : "No archived records match your search or filters."}
          </p>
        ) : (
          list.map((incident) => <ArchiveRow key={incident.id} incident={incident} tick={tick} />)
        )}
      </div>

      {fullList.length > 0 ? (
        <p className="caption" style={{ marginTop: "var(--space-4)", maxWidth: "80ch" }}>
          Restoring a dismissed image returns it to Manual review with its provisional tag and
          confidence intact; restoring an archived fire returns it to Resolved. Either way the
          decision stays on the record.
        </p>
      ) : null}
    </div>
  );
}
