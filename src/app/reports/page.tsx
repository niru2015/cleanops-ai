import { AppShell } from "@/components/app-shell";
import { SupervisorReport } from "@/components/supervisor-report";
import { getSupervisorReportWorkspace } from "@/integrations/reporting/supabase-reporting";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReportsPage() {
  let workspace: Awaited<ReturnType<typeof getSupervisorReportWorkspace>> | null = null;
  try {
    const runtime = await getReportingRuntime();
    workspace = await getSupervisorReportWorkspace(runtime.accessClient);
  } catch {}
  if (workspace) return <AppShell authenticated currentPath="/reports"><SupervisorReport workspace={workspace} /></AppShell>;
  return <AppShell currentPath="/reports"><section className="accessState"><p className="eyebrow">Client reporting</p><h1>Supervisor access required</h1><p>Sign in with the hosted demo supervisor account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
}
