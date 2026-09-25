import Link from "next/link";
import { combineSites, type SiteFinanceSummary } from "@/services/finance-summary";
import { Button, KpiCard, KpiCardGrid, SelectField, TextField } from "@/components/ui";

const amount = (value: number | null, currency: string) => value === null ? "N/A" :
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);

export function FinanceSummary({ sites, selectedSiteId, month }: {
  sites: SiteFinanceSummary[]; selectedSiteId: string | null; month: string;
}) {
  const visible = selectedSiteId ? sites.filter(site => site.siteId === selectedSiteId) : sites;
  const combined = combineSites(visible);
  return <section className="financePanel" aria-labelledby="finance-summary-title">
    <div className="panelHeading"><div><p className="eyebrow">Source-backed management view</p>
      <h2 id="finance-summary-title">Finance overview</h2></div></div>
    <form method="get" className="financeForm">
      <SelectField label="Casino" name="siteId" defaultValue={selectedSiteId ?? "all"}>
        <option value="all">All assigned casinos</option>
        {sites.map(site => <option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}
      </SelectField>
      <TextField label="Month" name="month" type="month" defaultValue={month} required />
      <Button variant="secondary" type="submit">View finance</Button>
    </form>
    <p className="recordNote">Recognized contribution appears only after a complete accepted accounting import and a current closed finance period. Expected contract revenue is a separate projection. Direct contribution excludes overhead, depreciation and tax.</p>
    {visible.length > 1 && <KpiCardGrid ariaLabel="Combined finance result">
      <KpiCard label="Recognized revenue" value={amount(combined.recognizedRevenue, combined.currency ?? "CAD")} />
      <KpiCard label="Direct contribution" value={amount(combined.contribution, combined.currency ?? "CAD")} />
      <KpiCard label="Margin" value={combined.margin === null ? "N/A" : `${(combined.margin * 100).toFixed(1)}%`} />
    </KpiCardGrid>}
    <div className="financeSummarySites">
      {visible.map(site => <article className="financePanel" key={site.siteId}>
        <h3>{site.siteName}</h3>
        <p>{site.period} · {site.currency} · {site.completeness} · period {site.periodState ?? "not opened"}{site.stale ? " · stale close" : ""}</p>
        <KpiCardGrid>
          <KpiCard label="Expected contract revenue" value={amount(site.expectedRevenue, site.currency)} />
          <KpiCard label="Recognized revenue" value={amount(site.recognizedRevenue, site.currency)} />
          <KpiCard label="Direct labour" value={amount(site.labour, site.currency)} />
          <KpiCard label="Supplies" value={amount(site.supplies, site.currency)} />
          <KpiCard label="Repairs" value={amount(site.repairs, site.currency)} />
          <KpiCard label="Other direct cost" value={amount(site.otherDirectCost, site.currency)} />
          <KpiCard label="Direct contribution" value={amount(site.contribution, site.currency)} />
          <KpiCard label="Margin" value={site.margin === null ? "N/A" : `${(site.margin * 100).toFixed(1)}%`} />
        </KpiCardGrid>
        <h4>Approved operational sources</h4>
        <p className="recordNote">Expense amounts use the claim&apos;s expense date. They are shown separately from accepted accounting costs and are never added twice to contribution. Worker-level rates remain Director-only.</p>
        <KpiCardGrid>
          <KpiCard label="Posted labour" value={amount(site.approvedOperational.labour, site.currency)} />
          <KpiCard label="Approved hours" value={site.approvedOperational.approvedHours === null ? "N/A" : site.approvedOperational.approvedHours.toFixed(2)} />
          <KpiCard label="Supply expenses" value={amount(site.approvedOperational.currency ? site.approvedOperational.supplies : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Repair expenses" value={amount(site.approvedOperational.currency ? site.approvedOperational.repairs : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Fuel and travel" value={amount(site.approvedOperational.currency ? site.approvedOperational.fuelTravel : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Meals" value={amount(site.approvedOperational.currency ? site.approvedOperational.meals : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Other direct expenses" value={amount(site.approvedOperational.currency ? site.approvedOperational.other : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Supply expense per approved hour" value={site.approvedOperational.approvedHours && site.approvedOperational.currency ? amount(site.approvedOperational.supplies / site.approvedOperational.approvedHours, site.approvedOperational.currency) : "N/A"} />
        </KpiCardGrid>
        {site.approvedOperational.assetReview > 0 && <p className="recordNote">{amount(site.approvedOperational.assetReview, site.approvedOperational.currency ?? site.currency)} equipment purchases await accounting/asset treatment and are excluded from direct cost.</p>}
        <p className="recordNote">{site.pendingExpenseCount} finance intake item(s) awaiting resolution. {site.unmatchedAmount === null ? "Reconciliation period not opened." : `${amount(site.unmatchedAmount, site.currency)} operational cost unmatched.`}</p>
        {site.flags.length > 0 && <div aria-label={`${site.siteName} review prompts`}>
          <h4>Review prompts</h4>
          <ul>{site.flags.map(flag => <li key={flag.code}>
            <strong>{flag.label}</strong> · {flag.detail} <Link href={flag.href}>Open source workspace</Link>
          </li>)}</ul>
          <p className="recordNote">Rules version 1. These prompts require human review and do not imply wrongdoing.</p>
        </div>}
        <p><Link href="/finance/contracts">Contracts</Link> · <Link href="/finance/projects">Projects</Link> · <Link href="/finance/expenses">Expenses</Link> · <Link href={`/finance/time?siteId=${site.siteId}`}>Time</Link> · <Link href="/finance/reconciliation">Reconciliation</Link></p>
      </article>)}
    </div>
  </section>;
}
