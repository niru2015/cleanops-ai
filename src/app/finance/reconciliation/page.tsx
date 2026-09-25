import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, DataTable, KpiCard, KpiCardGrid, SectionTabs, SelectField, StatusBadge, TextField, type DataTableColumn } from "@/components/ui";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getReconciliationWorkspace } from "@/integrations/finance/supabase-reconciliation";
import { reconcileFinance } from "./actions";

export const dynamic = "force-dynamic";

function money(value: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);
}

function periodStateTone(state: string) {
  if (state === "closed") return "success" as const;
  if (state === "review") return "info" as const;
  return "pending" as const;
}

function ActionButton({ label, kind, periodId, variant = "secondary" }: { label: string; kind: string; periodId: string; variant?: "primary" | "secondary" }) {
  return (
    <form action={reconcileFinance} className="inlineAction">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="periodId" value={periodId} />
      <Button variant={variant} type="submit">{label}</Button>
    </form>
  );
}

type SiteRow = Awaited<ReturnType<typeof getReconciliationWorkspace>>["sites"][number];
type PeriodRow = Awaited<ReturnType<typeof getReconciliationWorkspace>>["periods"][number];
type BatchRow = Awaited<ReturnType<typeof getReconciliationWorkspace>>["batches"][number];
type AllocationRow = Awaited<ReturnType<typeof getReconciliationWorkspace>>["allocations"][number];
type OperationalRow = Awaited<ReturnType<typeof getReconciliationWorkspace>>["operational"][number];
type CandidateRow = Awaited<ReturnType<typeof getReconciliationWorkspace>>["candidates"][number];
type LinkRow = Awaited<ReturnType<typeof getReconciliationWorkspace>>["links"][number];

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ periodId?: string; notice?: string; error?: string }> }) {
  const params = await searchParams;
  let loaded: Awaited<ReturnType<typeof getReconciliationWorkspace>> | null = null;
  let access: Awaited<ReturnType<typeof getAppAccessContext>> | null = null;
  let loadError: string | null = null;
  try {
    const client = await createSupabaseServerClient();
    access = await getAppAccessContext(client);
    if (!access.canViewFinance) throw new Error("Finance access required.");
    loaded = await getReconciliationWorkspace(client, access, params.periodId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Reconciliation unavailable.";
  }
  if (!loaded || !access) {
    return <AppShell currentPath="/finance"><section className="accessState"><h1>Reconciliation unavailable</h1><p>{loadError}</p><Link href="/finance">Finance overview</Link></section></AppShell>;
  }
  const { sites, periods, selected, batches, sources, allocations, links, candidates, operational } = loaded;
  const siteName = new Map(access.sites.map((site) => [site.id, site.name]));
  const matchedByAllocation = new Map<string, number>();
  for (const link of links.filter((item) => item.state === "active")) matchedByAllocation.set(link.source_allocation_id, (matchedByAllocation.get(link.source_allocation_id) ?? 0) + link.matched_amount);

  const needsAttention = sites.filter((row) => row.stale || row.unmatched_amount > 0).length;
  const fullyMatched = sites.filter((row) => !row.stale && row.unmatched_amount === 0).length;

  const siteColumns: DataTableColumn<SiteRow>[] = [
    { key: "period", header: "Period", render: (row) => row.period_start },
    { key: "site", header: "Site", render: (row) => siteName.get(row.site_id) ?? "Assigned site" },
    { key: "state", header: "State", render: (row) => <><StatusBadge tone={periodStateTone(row.state)}>{row.state}</StatusBadge>{row.stale ? <span> · changed after close</span> : null}</> },
    { key: "coverage", header: "Coverage", render: (row) => row.coverage },
    { key: "operational", header: "Operational", align: "right", render: (row) => money(row.operational_amount, row.currency) },
    { key: "matched", header: "Matched", align: "right", render: (row) => money(row.matched_amount, row.currency) },
    { key: "unmatched", header: "Unmatched", align: "right", render: (row) => money(row.unmatched_amount, row.currency) },
    { key: "unallocated", header: "Unallocated", align: "right", render: (row) => money(row.unallocated_source_amount, row.currency) },
  ];

  const periodColumns: DataTableColumn<PeriodRow>[] = [
    { key: "period", header: "Period", render: (row) => <Link href={`/finance/reconciliation?periodId=${row.period_id}`}>{row.period_start}</Link> },
    { key: "state", header: "State", render: (row) => <><StatusBadge tone={periodStateTone(row.state)}>{row.state}</StatusBadge>{row.stale ? <span> · stale</span> : null}</> },
    { key: "close", header: "Close version", align: "right", render: (row) => row.close_version },
    { key: "coverage", header: "Coverage", render: (row) => row.metrics.coverage },
  ];

  const batchColumns: DataTableColumn<BatchRow>[] = [
    { key: "file", header: "File", render: (row) => row.source_file_name },
    { key: "completeness", header: "Completeness", render: (row) => <StatusBadge tone={row.completeness === "complete" ? "success" : "pending"}>{row.completeness}</StatusBadge> },
    { key: "period", header: "Service period", render: (row) => `${row.service_period_start} to ${row.service_period_end}` },
  ];

  const allocationColumns: DataTableColumn<AllocationRow>[] = [
    { key: "period", header: "Period", render: (item) => sources.find((source) => source.id === item.source_row_id)?.service_period ?? "—" },
    { key: "site", header: "Site", render: (item) => siteName.get(item.site_id) ?? "Site" },
    { key: "category", header: "Category", render: (item) => sources.find((source) => source.id === item.source_row_id)?.category ?? "—" },
    { key: "amount", header: "Amount", align: "right", render: (item) => money(item.amount, sources.find((source) => source.id === item.source_row_id)?.currency) },
    { key: "remaining", header: "Remaining", align: "right", render: (item) => money(item.amount - (matchedByAllocation.get(item.id) ?? 0), sources.find((source) => source.id === item.source_row_id)?.currency) },
    { key: "id", header: "Allocation", render: (item) => <code>{item.id.slice(0, 8)}</code> },
    { key: "document", header: "Document", render: (item) => { const row = sources.find((source) => source.id === item.source_row_id); return row?.source_document_id ?? "—"; } },
  ];

  const operationalColumns: DataTableColumn<OperationalRow>[] = [
    { key: "date", header: "Date", render: (item) => item.service_date },
    { key: "site", header: "Site", render: (item) => siteName.get(item.site_id) ?? "Site" },
    { key: "type", header: "Type", render: (item) => item.entity_type.replaceAll("_", " ") },
    { key: "category", header: "Category", render: (item) => item.category },
    { key: "amount", header: "Amount", align: "right", render: (item) => money(item.amount, item.currency) },
    { key: "remaining", header: "Remaining", align: "right", render: (item) => money(item.amount - item.matched_amount, item.currency) },
    { key: "id", header: "Entity", render: (item) => <code>{item.entity_id.slice(0, 8)}</code> },
  ];

  const candidateColumns: DataTableColumn<CandidateRow>[] = [
    { key: "rule", header: "Rule", render: (item) => item.rule },
    { key: "amount", header: "Amount", align: "right", render: (item) => money(item.amount, item.currency) },
    { key: "site", header: "Site", render: (item) => siteName.get(item.site_id) ?? "Site" },
    { key: "match", header: "Match type", render: (item) => <StatusBadge tone={item.ambiguous ? "pending" : "success"}>{item.ambiguous ? "Ambiguous — manual review" : "Unique — ready"}</StatusBadge> },
    { key: "source", header: "Source", render: (item) => <code>{item.source_allocation_id.slice(0, 8)}</code> },
    { key: "operational", header: "Operational", render: (item) => <code>{item.operational_entity_id.slice(0, 8)}</code> },
  ];

  const linkColumns: DataTableColumn<LinkRow>[] = [
    { key: "state", header: "State", render: (item) => <StatusBadge tone={item.state === "active" ? "success" : "neutral"}>{item.state}</StatusBadge> },
    { key: "rule", header: "Rule", render: (item) => item.match_rule },
    { key: "amount", header: "Amount", align: "right", render: (item) => money(item.matched_amount) },
    { key: "rationale", header: "Rationale", render: (item) => item.rationale },
    { key: "linked", header: "Linked at", render: (item) => item.linked_at },
    {
      key: "action", header: "Action", render: (item) => item.state === "active" && selected && selected.state !== "closed" ? (
        <form action={reconcileFinance}>
          <input type="hidden" name="kind" value="void" />
          <input type="hidden" name="periodId" value={selected.period_id} />
          <input type="hidden" name="linkId" value={item.id} />
          <TextField label="Correction reason" name="reason" minLength={4} required />
          <Button variant="secondary" type="submit">Void match</Button>
        </form>
      ) : null,
    },
  ];

  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <SectionTabs items={getFinanceSectionTabs(access.canEditFinance)} currentPath="/finance/reconciliation" ariaLabel="Finance sections" />
    <h1>Accounting reconciliation and period close</h1>
    <p>Accepted accounting imports are the source of truth. Operational postings must be linked and balanced before a Director closes an organization-wide month.</p>
    {params.error ? <Alert tone="danger">{params.error}</Alert> : null}
    {params.notice ? <Alert tone="success">{params.notice}</Alert> : null}

    <KpiCardGrid>
      <KpiCard label="Sites reporting" value={sites.length} />
      <KpiCard label="Fully matched" value={fullyMatched} />
      <KpiCard label="Needs attention" value={needsAttention} help={needsAttention > 0 ? "Stale or has unmatched cost" : undefined} />
      <KpiCard
        label="Current period"
        value={selected ? selected.period_start : "Not opened"}
        help={selected ? <StatusBadge tone={periodStateTone(selected.state)}>{selected.state}</StatusBadge> : undefined}
      />
    </KpiCardGrid>

    {access.canEditFinance ? <section className="financePanel">
      <div className="panelHeading"><div><p className="eyebrow">Director action</p><h2>Open a month</h2></div></div>
      <form action={reconcileFinance} className="financeForm">
        <input type="hidden" name="kind" value="open" />
        <TextField label="Month" type="month" name="month" required defaultValue={new Date().toISOString().slice(0, 7)} />
        <Button variant="primary" type="submit">Open or view period</Button>
      </form>
    </section> : null}

    <section className="financePanel">
      <div className="panelHeading"><div><p className="eyebrow">Every assigned casino</p><h2>Site status</h2></div></div>
      <DataTable columns={siteColumns} rows={sites} getRowKey={(row) => `${row.period_id}-${row.site_id}`} emptyMessage="No finance period has been opened." />
    </section>

    {access.canEditFinance ? <>
      <section className="financePanel">
        <div className="panelHeading"><div><p className="eyebrow">Director-controlled</p><h2>Organization periods</h2></div></div>
        <DataTable columns={periodColumns} rows={periods} getRowKey={(row) => row.period_id} emptyMessage="Open a month to begin." />
      </section>

      {selected ? <>
        <section className="financePanel">
          <div className="panelHeading"><div><p className="eyebrow">Selected period</p><h2>{selected.period_start} close controls</h2></div></div>
          <KpiCardGrid>
            <KpiCard label="Coverage" value={selected.metrics.coverage} />
            <KpiCard label="Accepted batches" value={`${selected.metrics.completeCoverageBatches} complete`} help={`${selected.metrics.incompleteBatches} incomplete`} />
            <KpiCard label="Matched" value={money(selected.metrics.matchedAmount)} help={`Unmatched ${money(selected.metrics.unmatchedOperationalAmount)}`} />
            <KpiCard label="Unallocated accounting" value={money(selected.metrics.unallocatedSourceAmount)} />
          </KpiCardGrid>
          {selected.metrics.ambiguousSourceCount > 0 || selected.metrics.invalidSourceCount > 0 || selected.metrics.invalidLinkCount > 0 ? (
            <Alert tone="pending">
              Ambiguous {selected.metrics.ambiguousSourceCount} · invalid source {selected.metrics.invalidSourceCount} · invalid links {selected.metrics.invalidLinkCount}. A zero balance requires complete accepted coverage.
            </Alert>
          ) : null}
          <div className="financeRowActions">
            {selected.state !== "closed" ? <ActionButton label="Run deterministic matching" kind="auto" periodId={selected.period_id} /> : null}
            {(["open", "reopened"] as string[]).includes(selected.state) ? <ActionButton label="Move to review" kind="review" periodId={selected.period_id} /> : null}
            {selected.state === "review" ? <ActionButton label="Close balanced period" kind="close" periodId={selected.period_id} variant="primary" /> : null}
          </div>
          {selected.state === "closed" ? (
            <form action={reconcileFinance} className="financeForm">
              <input type="hidden" name="kind" value="reopen" />
              <input type="hidden" name="periodId" value={selected.period_id} />
              <TextField label="Correction reason" name="reason" minLength={4} required />
              <Button variant="secondary" type="submit">Reopen</Button>
            </form>
          ) : null}
        </section>

        <section className="financePanel">
          <div className="panelHeading"><div><p className="eyebrow">Source of truth</p><h2>Accepted accounting batches</h2></div></div>
          <DataTable columns={batchColumns} rows={batches} getRowKey={(row) => row.id} emptyMessage="No accepted batch covers this month. Close is blocked." />
        </section>

        <section className="financePanel">
          <div className="panelHeading"><div><p className="eyebrow">Accounting side</p><h2>Accounting allocations</h2></div></div>
          <DataTable columns={allocationColumns} rows={allocations} getRowKey={(row) => row.id} emptyMessage="No accepted allocations for this month." />
        </section>

        <section className="financePanel">
          <div className="panelHeading"><div><p className="eyebrow">Operational side</p><h2>Operational postings</h2></div></div>
          <DataTable columns={operationalColumns} rows={operational} getRowKey={(row) => `${row.entity_type}-${row.entity_id}`} emptyMessage="No posted operational cost in this month." />
        </section>

        <section className="financePanel">
          <div className="panelHeading"><div><p className="eyebrow">System-proposed</p><h2>Deterministic proposals</h2></div></div>
          <DataTable columns={candidateColumns} rows={candidates} getRowKey={(row) => `${row.source_allocation_id}-${row.operational_entity_id}`} emptyMessage="No unique or ambiguous proposals remain." />
        </section>

        {selected.state !== "closed" ? <section className="financePanel">
          <div className="panelHeading"><div><p className="eyebrow">Manual override</p><h2>Manual match or split</h2></div></div>
          <p>Choose both records and enter an amount within their remaining balances. The database checks site, project, category, currency and period.</p>
          <form action={reconcileFinance} className="financeForm">
            <input type="hidden" name="kind" value="manual" />
            <input type="hidden" name="periodId" value={selected.period_id} />
            <SelectField label="Accounting allocation" name="allocationId" required defaultValue="">
              <option value="" disabled>Choose allocation</option>
              {allocations.filter((item) => item.amount > (matchedByAllocation.get(item.id) ?? 0)).map((item) => {
                const row = sources.find((source) => source.id === item.source_row_id);
                return <option key={item.id} value={item.id}>{row?.category} · {siteName.get(item.site_id) ?? "Site"} · {money(item.amount - (matchedByAllocation.get(item.id) ?? 0), row?.currency)} remaining · {item.id.slice(0, 8)}</option>;
              })}
            </SelectField>
            <SelectField label="Operational record" name="entity" required defaultValue="">
              <option value="" disabled>Choose posting</option>
              {operational.filter((item) => item.amount > item.matched_amount).map((item) => (
                <option key={`${item.entity_type}-${item.entity_id}`} value={`${item.entity_type}:${item.entity_id}`}>{item.entity_type.replaceAll("_", " ")} · {siteName.get(item.site_id) ?? "Site"} · {money(item.amount - item.matched_amount, item.currency)} remaining · {item.entity_id.slice(0, 8)}</option>
              ))}
            </SelectField>
            <div className="financeFormRow">
              <TextField label="Amount" name="amount" type="number" min="0.01" step="0.01" required />
              <TextField label="Reason" name="reason" minLength={4} required />
            </div>
            <Button variant="primary" type="submit">Link amount</Button>
          </form>
        </section> : null}

        <section className="financePanel">
          <div className="panelHeading"><div><p className="eyebrow">Provenance</p><h2>Match audit</h2></div></div>
          <DataTable columns={linkColumns} rows={links} getRowKey={(row) => row.id} emptyMessage="No match decisions yet." />
        </section>
      </> : null}
    </> : null}
  </AppShell>;
}
