import { AppShell } from "@/components/app-shell";
import { IncidentOperations } from "@/components/incident-operations";
import { getIncidentWorkspace, type IncidentWorkspace } from "@/integrations/reporting/supabase-reporting";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, type AppAccessContext } from "@/services/access-context";
import { DEMO_SITE_ID } from "@/services/operations-runtime";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  workspace: IncidentWorkspace | null;
  fixtureAvailable: boolean;
};

export default async function IncidentsPage() {
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const fixtureAvailable =
      access.role === "organization_administrator" ||
      access.sites.some((site) => site.id === DEMO_SITE_ID);
    let workspace: IncidentWorkspace | null = null;
    if (access.canViewIncidents && fixtureAvailable) {
      const runtime = await getReportingRuntime();
      workspace = await getIncidentWorkspace(runtime.accessClient);
    }
    loaded = { access, workspace, fixtureAvailable };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/incidents"><section className="accessState"><p className="eyebrow">Incident &amp; equipment desk</p><h1>Sign in required</h1><p>Use an authorized CleanOps demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
  const { access, workspace, fixtureAvailable } = loaded;
  if (!access.canViewIncidents) {
    return <AppShell authenticated currentPath="/incidents" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Incident &amp; equipment desk</p><h1>Incident access restricted</h1><p>This role cannot access incident management.</p></section></AppShell>;
  }
  if (!fixtureAvailable) {
    return <AppShell authenticated currentPath="/incidents" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Incident &amp; equipment desk</p><h1>No incident fixture for assigned casinos</h1><p>The current incident walkthrough is seeded only at Grand Villa Casino.</p></section></AppShell>;
  }
  return <AppShell authenticated currentPath="/incidents" role={access.role} roleLabel={access.roleLabel}>{workspace ? <IncidentOperations workspace={workspace} /> : null}</AppShell>;
}
