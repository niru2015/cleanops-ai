import { AppShell } from "@/components/app-shell";
import { ClientReport } from "@/components/client-report";
import { getClientReportWorkspace } from "@/integrations/reporting/supabase-reporting";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ClientReportPage() {
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (access.role !== "client_viewer" && access.role !== "organization_administrator") {
      return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Client report</p><h1>Client report access restricted</h1><p>This view is reserved for the client-viewer role and Directors.</p></section></AppShell>;
    }
    const runtime = await getReportingRuntime(access.role === "client_viewer" ? "client" : "supervisor");
    const report = await getClientReportWorkspace(runtime.accessClient, runtime.actorUserId);
    return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><ClientReport report={report} /></AppShell>;
  } catch {
    return <AppShell currentPath="/reports"><section className="accessState"><p className="eyebrow">Client report</p><h1>Client site access required</h1><p>Sign in with an authorized demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
}
