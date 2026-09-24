import Link from "next/link";
import { combineSites, type SiteFinanceSummary } from "@/services/finance-summary";

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
      <label>Casino<select name="siteId" defaultValue={selectedSiteId ?? "all"}>
        <option value="all">All assigned casinos</option>
        {sites.map(site => <option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}
      </select></label>
      <label>Month<input name="month" type="month" defaultValue={month} required /></label>
      <button className="reviewButton reviewButton-secondary" type="submit">View finance</button>
    </form>
    <p className="recordNote">Recognized contribution appears only after a complete accepted accounting import and a current closed finance period. Expected contract revenue is a separate projection. Direct contribution excludes overhead, depreciation and tax.</p>
    {visible.length > 1 && <div className="financeMetricGrid" aria-label="Combined finance result">
      <div><span>Recognized revenue</span><strong>{amount(combined.recognizedRevenue, combined.currency ?? "CAD")}</strong></div>
      <div><span>Direct contribution</span><strong>{amount(combined.contribution, combined.currency ?? "CAD")}</strong></div>
      <div><span>Margin</span><strong>{combined.margin === null ? "N/A" : `${(combined.margin * 100).toFixed(1)}%`}</strong></div>
    </div>}
    <div className="financeSummarySites">
      {visible.map(site => <article className="financePanel" key={site.siteId}>
        <h3>{site.siteName}</h3>
        <p>{site.period} · {site.currency} · {site.completeness} · period {site.periodState ?? "not opened"}{site.stale ? " · stale close" : ""}</p>
        <div className="financeMetricGrid">
          <div><span>Expected contract revenue</span><strong>{amount(site.expectedRevenue, site.currency)}</strong></div>
          <div><span>Recognized revenue</span><strong>{amount(site.recognizedRevenue, site.currency)}</strong></div>
          <div><span>Direct labour</span><strong>{amount(site.labour, site.currency)}</strong></div>
          <div><span>Supplies</span><strong>{amount(site.supplies, site.currency)}</strong></div>
          <div><span>Repairs</span><strong>{amount(site.repairs, site.currency)}</strong></div>
          <div><span>Other direct cost</span><strong>{amount(site.otherDirectCost, site.currency)}</strong></div>
          <div><span>Direct contribution</span><strong>{amount(site.contribution, site.currency)}</strong></div>
          <div><span>Margin</span><strong>{site.margin === null ? "N/A" : `${(site.margin * 100).toFixed(1)}%`}</strong></div>
        </div>
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
