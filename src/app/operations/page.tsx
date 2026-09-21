import { AppShell } from "@/components/app-shell";
import { OperationsCommand } from "@/components/operations-command";
import { SitePortfolio } from "@/components/site-portfolio";
import { getOperationsWorkspace } from "@/integrations/operations/supabase-operations";
import { getSitePortfolio } from "@/integrations/operations/supabase-site-portfolio";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, type AppAccessContext } from "@/services/access-context";
import { DEMO_SITE_ID, getOperationsRuntime } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  workspace: Awaited<ReturnType<typeof getOperationsWorkspace>> | null;
  portfolio: Awaited<ReturnType<typeof getSitePortfolio>>;
  fixtureAvailable: boolean;
};

export default async function OperationsPage() {
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const fixtureAvailable =
      access.role === "organization_administrator" ||
      access.sites.some((site) => site.id === DEMO_SITE_ID);
    let workspace: Loaded["workspace"] = null;
    const portfolio = await getSitePortfolio(client, access.sites);
    if (access.canManageOperations && fixtureAvailable) {
      const runtime = await getOperationsRuntime("supervisor");
      workspace = await getOperationsWorkspace(runtime.accessClient);
    }
    loaded = { access, workspace, portfolio, fixtureAvailable };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/operations"><section className="accessState"><p className="eyebrow">Operations command</p><h1>Sign in required</h1><p>Use an authorized CleanOps demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
  const { access, workspace, portfolio, fixtureAvailable } = loaded;
  if (!access.canManageOperations) {
    return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Operations command</p><h1>Operations access restricted</h1><p>This role does not manage casino operations.</p></section></AppShell>;
  }
  if (!fixtureAvailable) {
    return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}><SitePortfolio portfolio={portfolio} /></AppShell>;
  }
  return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}><SitePortfolio portfolio={portfolio} />{workspace ? <OperationsCommand workspace={workspace} /> : null}</AppShell>;
}
