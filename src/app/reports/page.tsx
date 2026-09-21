import { AppShell } from "@/components/app-shell";
import { SupervisorReport } from "@/components/supervisor-report";
import { getSupervisorReportWorkspace } from "@/integrations/reporting/supabase-reporting";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { DEMO_SITE_ID } from "@/services/operations-runtime";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReportsPage() {
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canViewReports || access.role === "client_viewer") {
      return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Client reporting</p><h1>Use the client report view</h1><p><a className="reviewButton reviewButton-primary" href="/reports/client">Open released report</a></p></section></AppShell>;
    }
    const hasFixtureSite = access.role === "organization_administrator" || access.sites.some((site) => site.id === DEMO_SITE_ID);
    if (!hasFixtureSite) {
      return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Client reporting</p><h1>No reporting fixture for assigned casinos</h1><p>The current detailed reporting walkthrough is seeded only at Grand Villa Casino.</p></section></AppShell>;
    }
    const runtime = await getReportingRuntime();
    const workspace = await getSupervisorReportWorkspace(runtime.accessClient);
    return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><SupervisorReport workspace={workspace} /></AppShell>;
  } catch {
    return <AppShell currentPath="/reports"><section className="accessState"><p className="eyebrow">Client reporting</p><h1>Sign in required</h1><p>Use an authorized CleanOps demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
}
