import Link from "next/link";
import type { SitePortfolio as SitePortfolioData } from "@/integrations/operations/supabase-site-portfolio";

const stateLabel = (state: string) => state.replaceAll("_", " ");

export function SitePortfolio({ portfolio }: { portfolio: SitePortfolioData }) {
  const equipmentCount = portfolio.sites.reduce((sum, site) => sum + site.equipment.length, 0);
  return (
    <section className="sitePortfolio" aria-labelledby="site-portfolio-title">
      <header className="portfolioHeader">
        <div><p className="eyebrow">Database-backed portfolio</p><h1 id="site-portfolio-title">Assigned casinos</h1><p>Every casino and equipment record available to this account. All operational content is synthetic demo data.</p></div>
        <div className="portfolioTotals"><strong>{portfolio.sites.length}</strong><span>casinos</span><strong>{equipmentCount}</strong><span>equipment assets</span></div>
      </header>
      <div className="sitePortfolioGrid">
        {portfolio.sites.map((site) => (
          <article className="sitePortfolioCard" key={site.id}>
            <div className="sitePortfolioTitle"><div><p>{site.city ?? "British Columbia"}</p><h2>{site.name}</h2></div><span>{site.equipment.length} assets</span></div>
            <dl className="sitePortfolioMetrics"><div><dt>Areas</dt><dd>{site.zones.length}</dd></div><div><dt>Tasks</dt><dd>{site.activeTasks}</dd></div><div><dt>Task records</dt><dd>{site.taskRuns}</dd></div><div><dt>Eligible workers</dt><dd>{site.workers}</dd></div></dl>
            <div className="sitePortfolioAreas"><strong>Areas</strong><p>{site.zones.length ? site.zones.map((zone) => zone.name).join(" · ") : "No areas recorded"}</p></div>
            <div className="equipmentRegister">
              <div className="equipmentRegisterHeading"><strong>Equipment register</strong><span>{site.equipmentReports.length} issue reports</span></div>
              {site.equipment.length ? site.equipment.map((asset) => (
                <div className="equipmentAsset" key={asset.id}>
                  <div><strong>{asset.type}</strong><span><Link href={`/equipment/${asset.id}`}>{asset.assetTag}</Link>{asset.model ? ` · ${asset.manufacturer ?? ""} ${asset.model}` : ""}</span><small>Condition: {stateLabel(asset.condition)}{asset.nextServiceAt ? ` · service due ${asset.nextServiceAt}` : ""}</small></div>
                  <span className={`equipmentAssetState equipmentAssetState-${asset.state}`}>{stateLabel(asset.state)}</span>
                </div>
              )) : <p className="portfolioEmpty">No equipment assets recorded.</p>}
              {site.equipmentReports.map((report) => <p className="equipmentIssueSummary" key={report.id}>Issue: {report.label} · {stateLabel(report.state)}</p>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
