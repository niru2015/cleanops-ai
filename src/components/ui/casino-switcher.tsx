export type CasinoOption = { id: string; name: string; city?: string | null };

export function CasinoSwitcher({
  name,
  sites,
  selectedId,
  allowAll,
  allLabel = "All assigned casinos",
  label = "Casino",
}: {
  name: string;
  sites: CasinoOption[];
  selectedId: string;
  allowAll?: boolean;
  allLabel?: string;
  label?: string;
}) {
  if (sites.length <= 1 && !allowAll) {
    return <span className="ui-casinoSwitcher-static">{sites[0]?.name ?? "No assigned casino"}</span>;
  }
  return (
    <label className="ui-field ui-casinoSwitcher">
      <span className="ui-field-label">{label}</span>
      <select name={name} defaultValue={selectedId} className="ui-field-input ui-field-select">
        {allowAll ? <option value="all">{allLabel}</option> : null}
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
            {site.city ? ` · ${site.city}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
