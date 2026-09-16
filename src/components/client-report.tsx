import type { ClientReportWorkspace } from "@/integrations/reporting/supabase-reporting";

export function ClientReport({ report }: { report: ClientReportWorkspace | null }) {
  if (!report) return <section className="clientReportEmpty"><p className="eyebrow">Client portal</p><h1>No released report</h1><p>A supervisor must explicitly release the redacted shift report before it appears here.</p><a href="/reports">Return to supervisor report</a></section>;
  return (
    <div className="clientReport">
      <header><div><p className="eyebrow">Released service report · synthetic</p><h1>{report.site_name}</h1><p>{report.client_name} · Sunday night shift</p></div><span className="releaseBadge releaseBadgeReleased">Released</span></header>
      <section className="clientMetric"><span>Approved-on-time completion</span><strong>{report.completion_rate === null ? "N/A" : `${report.completion_rate.toFixed(1)}%`}</strong><p>{report.approved_on_time_runs} / {report.due_required_runs} due required task runs · {report.excluded_runs} exclusions</p></section>
      <section className="clientDefinition"><p><strong>Definition v{report.definition_version}:</strong> {report.definition_name}</p><p><strong>Calculation:</strong> {report.numerator_rule}. {report.denominator_rule}.</p><p><strong>Exclusions:</strong> {report.exclusion_rule}.</p></section>
      <div className="reportingGrid"><article className="reportingPanel"><p className="eyebrow">Incident summary</p><h2>{report.incident_count} documented</h2><p>{report.incident_summary}</p></article><article className="reportingPanel"><p className="eyebrow">Equipment summary</p><h2>{report.equipment_report_count} reported</h2><p>{report.equipment_summary}</p></article></div>
      <section className="clientSafety"><span>Safety checks</span><strong>N/A</strong><p>{report.safety_explanation}</p></section>
      <p className="clientPrivacyNote">This client view contains the released redacted snapshot only. Worker statements, private evidence and internal audit details are not included.</p>
    </div>
  );
}
