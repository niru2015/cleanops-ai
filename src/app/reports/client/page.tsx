import { AppShell } from "@/components/app-shell";
import { ClientReport } from "@/components/client-report";
import { getClientReportWorkspace } from "@/integrations/reporting/supabase-reporting";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ClientReportPage() {
  let report: Awaited<ReturnType<typeof getClientReportWorkspace>> | undefined;
  try {
    const runtime = await getReportingRuntime("client");
    report = await getClientReportWorkspace(runtime.accessClient, runtime.actorUserId);
  } catch {}
  if (report !== undefined) return <AppShell authenticated currentPath="/reports"><ClientReport report={report} /></AppShell>;
  return <AppShell currentPath="/reports"><section className="accessState"><p className="eyebrow">Client report</p><h1>Client site access required</h1><p>Sign in with the hosted demo client-viewer account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
}
