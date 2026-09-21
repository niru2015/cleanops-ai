import { AppShell } from "@/components/app-shell";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { getFinanceWorkspace } from "@/integrations/finance/supabase-finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, resolveSelectedSite } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);

    if (!access.canViewFinance) {
      return (
        <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
          <section className="accessState">
            <p className="eyebrow">Finance &amp; inventory</p>
            <h1>Finance access restricted</h1>
            <p>Financial information is available only to Directors and the Area Manager responsible for the selected casino.</p>
          </section>
        </AppShell>
      );
    }

    const params = await searchParams;
    const selectedSite = resolveSelectedSite(access, params.siteId);
    if (!selectedSite) {
      return (
        <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
          <section className="accessState">
            <p className="eyebrow">Finance &amp; inventory</p>
            <h1>No casino assignment</h1>
            <p>This account does not currently have access to a casino.</p>
          </section>
        </AppShell>
      );
    }

    const finance = await getFinanceWorkspace(client, selectedSite.id);

    return (
      <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
        <section className="siteScopeBar" aria-label="Casino scope">
          <div>
            <p className="eyebrow">Casino scope</p>
            <strong>{selectedSite.name}{selectedSite.city ? ` · ${selectedSite.city}` : ""}</strong>
          </div>
          <form method="get">
            <label>
              <span className="visuallyHidden">Choose casino</span>
              <select name="siteId" defaultValue={selectedSite.id}>
                {access.sites.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}{site.city ? ` · ${site.city}` : ""}</option>
                ))}
              </select>
            </label>
            <button className="reviewButton reviewButton-secondary" type="submit">Open casino</button>
          </form>
          <span className="recordLabel">{access.canEditFinance ? "Director · edit" : "Area Manager · read only"}</span>
        </section>
        <FinanceWorkspace workspace={finance} editable={access.canEditFinance} siteId={selectedSite.id} />
      </AppShell>
    );
  } catch {
    return (
      <AppShell currentPath="/finance">
        <section className="accessState">
          <p className="eyebrow">Finance &amp; inventory</p>
          <h1>Sign in required</h1>
          <p>Use a Director or Area Manager demo account.</p>
          <a className="reviewButton reviewButton-primary" href="/login">Sign in</a>
        </section>
      </AppShell>
    );
  }
}
