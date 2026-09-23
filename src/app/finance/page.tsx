import { AppShell } from "@/components/app-shell";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { MessageContextQueue } from "@/components/message-context-queue";
import { getFinanceWorkspace, type FinanceWorkspace as FinanceWorkspaceData } from "@/integrations/finance/supabase-finance";
import { getMessageWorkspace, type MessageWorkspace } from "@/integrations/messages/supabase-message-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, resolveSelectedSite, type AppAccessContext, type AccessSite } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  selectedSite: AccessSite | null;
  finance: FinanceWorkspaceData | null;
  messages: MessageWorkspace | null;
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const params = await searchParams;
    const selectedSite = resolveSelectedSite(access, params.siteId);
    const [finance, messages] =
      access.canViewFinance && selectedSite
        ? await Promise.all([
            getFinanceWorkspace(client, selectedSite.id, access.canEditFinance),
            getMessageWorkspace(client, access.userId, selectedSite.id),
          ])
        : [null, null];
    loaded = { access, selectedSite, finance, messages };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/finance"><section className="accessState"><p className="eyebrow">Finance &amp; inventory</p><h1>Sign in required</h1><p>Use a Director or Area Manager demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }

  const { access, selectedSite, finance, messages } = loaded;

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

  if (!selectedSite || !finance || !messages) {
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
      <MessageContextQueue workspace={messages} />
    </AppShell>
  );
}
