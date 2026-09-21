import { AppShell } from "@/components/app-shell";
import { ClientReport } from "@/components/client-report";
import { getClientReportWorkspace, getSupervisorReportWorkspace, type ClientReportWorkspace } from "@/integrations/reporting/supabase-reporting";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, type AppAccessContext } from "@/services/access-context";
import { getReportingRuntime } from "@/services/reporting-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  report: ClientReportWorkspace | null;
};

export default async function ClientReportPage() {
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    let report: ClientReportWorkspace | null = null;

    if (access.role === "client_viewer") {
      const runtime = await getReportingRuntime("client");
      report = await getClientReportWorkspace(runtime.accessClient, runtime.actorUserId);
    } else if (access.role === "organization_administrator") {
      const supervisor = await getSupervisorReportWorkspace(client);
      if (supervisor.report?.state === "released" && supervisor.report.released_at) {
        report = {
          report_id: supervisor.report.id,
          client_name: supervisor.clientName,
          site_name: supervisor.siteName,
          window_start: supervisor.definition.window_start,
          window_end: supervisor.definition.window_end,
          definition_name: supervisor.definition.name,
          definition_version: supervisor.definition.version,
          numerator_rule: supervisor.definition.numerator_rule,
          denominator_rule: supervisor.definition.denominator_rule,
          exclusion_rule: supervisor.definition.exclusion_rule,
          due_required_runs: supervisor.report.due_required_runs,
          approved_on_time_runs: supervisor.report.approved_on_time_runs,
          excluded_runs: supervisor.report.excluded_runs,
          completion_rate: supervisor.report.completion_rate,
          incident_count: supervisor.report.incident_count,
          equipment_report_count: supervisor.report.equipment_report_count,
          incident_summary: supervisor.report.incident_summary,
          equipment_summary: supervisor.report.equipment_summary,
          safety_status: supervisor.report.safety_status,
          safety_explanation: supervisor.report.safety_explanation,
          released_at: supervisor.report.released_at,
        };
      }
    }

    loaded = { access, report };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/reports"><section className="accessState"><p className="eyebrow">Client report</p><h1>Client site access required</h1><p>Sign in with an authorized demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }

  const { access, report } = loaded;
  if (access.role !== "client_viewer" && access.role !== "organization_administrator") {
    return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Client report</p><h1>Client report access restricted</h1><p>This view is reserved for the client-viewer role and Directors.</p></section></AppShell>;
  }

  return <AppShell authenticated currentPath="/reports" role={access.role} roleLabel={access.roleLabel}><ClientReport report={report} /></AppShell>;
}
