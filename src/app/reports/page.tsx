import { AppShell } from "@/components/app-shell";
import { SupervisorReport } from "@/components/supervisor-report";
import { getSupervisorReportWorkspace, type SupervisorReportWorkspace } from "@/integrations/reporting/supabase-reporting";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, type AppAccessContext } from "@/services/access-context";
import { DEMO_SITE_ID } from "@/services/operations-runtime";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  workspace: SupervisorReportWorkspace | null;
  fixtureAvailable: boolean;
};

export default async function ReportsPage() {
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const fixtureAvailable =
      access.role === "organization_administrator" ||
      access.sites.some((site) => site.id === DEMO_SITE_ID);
    let workspace: SupervisorReportWorkspace | null = null;
    if (access.canViewReports && access.role !== "client_viewer" && fixtureAvailable) {
      const runtime = await getReportingRuntime();
      workspace = await getSupervisorReportWorkspace(runtime.accessClient);
    }
    loaded = { access, workspace, fixtureAvailable };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/reports"><section className="accessState"><p className="eyebrow">Client reporting</p><h1>Sign in required</h1><p>Use an authorized CleanOps demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
  const { access, workspace, fixtureAvailable } = loaded;
  if (!access.canViewReports || access.role === "client_viewer") {
    return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Client reporting</p><h1>Use the client report view</h1><p><a className="reviewButton reviewButton-primary" href="/reports/client">Open released report</a></p></section></AppShell>;
  }
  if (!fixtureAvailable) {
    return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Client reporting</p><h1>No reporting fixture for assigned casinos</h1><p>The current detailed reporting walkthrough is seeded only at Grand Villa Casino.</p></section></AppShell>;
  }
  return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}>{workspace ? <SupervisorReport workspace={workspace} /> : null}</AppShell>;
}
