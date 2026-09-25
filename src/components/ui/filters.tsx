"use client";

import { useId } from "react";

export type FilterChip = { value: string; label: string };

export function FilterBar({
  searchLabel,
  searchValue,
  onSearchChange,
  resultCount,
  chips,
  activeChip,
  onChipChange,
  onClear,
}: {
  searchLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  resultCount: number;
  chips?: FilterChip[];
  activeChip?: string | null;
  onChipChange?: (value: string | null) => void;
  onClear?: () => void;
}) {
  const searchId = useId();
  const hasFilter = searchValue.length > 0 || (activeChip ?? null) !== null;
  return (
    <div className="ui-filterBar">
      <label className="ui-filterBar-search" htmlFor={searchId}>
        <span className="ui-field-label">{searchLabel}</span>
        <input
          id={searchId}
          type="search"
          className="ui-field-input"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search…"
        />
      </label>
      {chips && chips.length > 0 ? (
        <div className="ui-filterBar-chips" role="group" aria-label="Filter by state">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className="ui-filterChip"
              aria-pressed={activeChip === chip.value}
              onClick={() => onChipChange?.(activeChip === chip.value ? null : chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      <span className="ui-filterBar-count">
        {resultCount} {resultCount === 1 ? "result" : "results"}
      </span>
      {hasFilter && onClear ? (
        <button type="button" className="ui-filterBar-clear" onClick={onClear}>
          Clear
        </button>
      ) : null}
    </div>
  );
}
