import { AppShell } from "@/components/app-shell";
import { IncidentOperations } from "@/components/incident-operations";
import { getIncidentWorkspace } from "@/integrations/reporting/supabase-reporting";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function IncidentsPage() {
  let workspace: Awaited<ReturnType<typeof getIncidentWorkspace>> | null = null;
  try {
    const runtime = await getReportingRuntime();
    workspace = await getIncidentWorkspace(runtime.accessClient);
  } catch {}
  if (workspace) return <AppShell currentPath="/incidents"><IncidentOperations workspace={workspace} /></AppShell>;
  return <AppShell currentPath="/incidents"><section className="accessState"><p className="eyebrow">Incident &amp; equipment desk</p><h1>Supervisor access required</h1><p>Start the local synthetic demo or sign in with access to this site.</p></section></AppShell>;
}
