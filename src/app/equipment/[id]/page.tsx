import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getEquipmentAssetDetail } from "@/integrations/equipment/supabase-equipment";
import { saveEquipmentEvent } from "@/app/equipment/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function when(value: string | null) { return value ? new Date(value).toLocaleString("en-CA") : "Unknown"; }
function formKind(assetId: string, kind: string) { return <><input type="hidden" name="assetId" value={assetId} /><input type="hidden" name="kind" value={kind} /></>; }

export default async function EquipmentDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const notice = await searchParams;
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const detail = z.string().uuid().safeParse(id).success ? await getEquipmentAssetDetail(client, access, id) : null;
  if (!detail) return <AppShell authenticated currentPath="/equipment" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState"><h1>Asset unavailable</h1><p>This asset is outside your assigned sites or does not exist.</p><Link href="/equipment">Back to register</Link></section>
  </AppShell>;
  const { asset, siteHistory, checklists, inspections, reports, actions, links, zones, workers,
    evidenceRows, evidenceLinks, postings, unlinkedReports, repairTerms, loadedAt } = detail;
  const siteNames = new Map(access.sites.map((site) => [site.id, site.name]));
  const canManage = ["site_supervisor", "area_manager", "operations_manager", "organization_administrator"].includes(access.role);
  const director = access.canEditFinance;
  const latestInspection = inspections[0];
  const overdue = latestInspection?.outcome === "follow_up_required" && latestInspection.follow_up_due_at &&
    new Date(latestInspection.follow_up_due_at).getTime() < new Date(loadedAt).getTime();
  const postingById = new Map(postings.map((posting) => [posting.id, posting]));
  const linkedPostings = links.map((link) => postingById.get(link.expense_posting_id)).filter((posting) => posting !== undefined);
  const currency = linkedPostings.length && linkedPostings.every((posting) => posting.currency === linkedPostings[0].currency)
    ? linkedPostings[0].currency : null;
  const repairTotal = currency ? linkedPostings.reduce((sum, posting) => sum + posting.amount, 0) : null;
  return <AppShell authenticated currentPath="/equipment" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState equipmentDetail">
      <p className="eyebrow">Equipment care / {siteNames.get(asset.site_id) ?? "Assigned site"}</p>
      <h1>{asset.asset_code}</h1>
      <p><Link href="/equipment">Asset register</Link> · {asset.equipment_models?.manufacturer ?? "Unknown manufacturer"} {asset.equipment_models?.model_name ?? "Unknown model"}</p>
      <p>Status: <strong>{asset.status}</strong>; condition: {asset.condition}. Acquired: {asset.acquired_on ?? "unknown"}. Runtime hours: {asset.runtime_hours ?? "unknown"}. Last service: {asset.last_service_date ?? "unknown"}. Next service: {asset.next_service_date ?? "unknown"}.</p>
      <p>Repeated faults indicate history for review. They do not identify staff causation or prove a repair is complete.</p>
      {notice.error && <p role="alert">{notice.error}</p>}{notice.saved && <p role="status">{notice.saved}</p>}
      <h2>Care and follow-up</h2>
      <p>{inspections.length ? `${inspections.length} recorded inspection${inspections.length === 1 ? "" : "s"}.` : "No post-use inspection recorded."} {overdue ? "Latest follow-up is overdue." : latestInspection?.outcome === "follow_up_required" ? "Follow-up is open." : ""}</p>
      {checklists.length ? <p>Current source-backed checklist: v{checklists[0].version_number}, {checklists[0].source_kind}, {checklists[0].source_reference}.</p> : <p>No approved checklist version is available for this model. Do not assume a manufacturer procedure.</p>}
      <ul>{inspections.map((inspection) => <li key={inspection.id}>
        {when(inspection.inspected_at)} · {inspection.outcome} · inspector {inspection.inspector_user_id.slice(0, 8)}
        {inspection.operator_user_id ? ` · operator ${inspection.operator_user_id.slice(0, 8)}` : " · operator not recorded"}
        {inspection.follow_up_due_at ? ` · follow-up due ${when(inspection.follow_up_due_at)}` : ""}
        {inspection.notes ? ` · ${inspection.notes}` : ""}
      </li>)}</ul>
      {canManage && checklists.length > 0 && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "inspection")}<h3>Record post-use inspection</h3>
        <input type="hidden" name="checklistId" value={checklists[0].id} />
        <p>Use checklist version {checklists[0].version_number}: {checklists[0].source_reference}.</p>
        <label>Operator, if known <select name="operatorId"><option value="">Unknown</option>{workers.filter((worker) => worker.auth_user_id && worker.auth_user_id !== access.userId).map((worker) => <option key={worker.id} value={worker.auth_user_id ?? ""}>{worker.display_name}</option>)}</select></label>
        <label>Outcome <select name="outcome"><option value="care_ok">Care OK</option><option value="follow_up_required">Follow-up required</option></select></label>
        <div className="equipmentChecklistSteps"><strong>Approved checklist steps</strong>{checklists[0].instructions.map((step, index) =>
          <label key={index}>{typeof step === "string" ? step : `Step ${index + 1}`}
            <select name={`step-${index}`} required><option value="care_ok">Care OK</option><option value="follow_up_required">Follow-up required</option><option value="not_checked">Not checked</option></select>
          </label>)}</div>
        <label>Notes <textarea name="notes" /></label><label>Follow-up due <input name="followUpDueAt" type="datetime-local" /></label>
        <button type="submit">Save inspection</button>
      </form>}
      {director && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "checklist")}<input type="hidden" name="modelId" value={asset.model_id} />
        <h3>Approve source-backed checklist version</h3>
        <p>Enter only steps from a manufacturer document or customer-approved source. A new version preserves prior inspections.</p>
        <label>Source <select name="sourceKind"><option value="manufacturer">Manufacturer</option><option value="customer_approved">Customer approved</option></select></label>
        <label>Document/reference <input name="sourceReference" minLength={3} required /></label>
        <label>Source instructions, one per line <textarea name="instructions" required /></label>
        <button type="submit">Approve checklist version</button>
      </form>}
      <h2>Faults and maintenance</h2>
      <p>{reports.length >= 2 ? `${reports.length} attributed fault reports; repeat issue requires review.` : reports.length === 1 ? "One attributed fault report." : "No linked fault report."}</p>
      <ul>{reports.map((report) => <li key={report.id}>
        {when(report.reported_at)} · {report.state} · {report.issue_description} · reported by {report.created_by.slice(0, 8)}
      </li>)}</ul>
      <ul>{actions.map((action) => <li key={action.id}>
        {when(action.recorded_at)} · {action.action_kind} · {action.notes} · actor {action.performed_by.slice(0, 8)}
        {action.vendor_reference ? ` · vendor reference ${action.vendor_reference}` : ""}
        {action.corrects_action_id ? ` · corrects ${action.corrects_action_id.slice(0, 8)}` : ""}
      </li>)}</ul>
      {canManage && zones.length > 0 && workers.length > 0 && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "fault")}<input type="hidden" name="eventKey" value={`asset-fault-${crypto.randomUUID()}`} />
        <h3>Report a neutral fault</h3><label>Zone <select name="zoneId">{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        <label>Reporting worker <select name="workerId">{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.display_name}</option>)}</select></label>
        <label>Observed issue <textarea name="description" minLength={3} required /></label><button type="submit">Record fault</button>
      </form>}
      {canManage && unlinkedReports.length > 0 && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "linkFault")}<h3>Link an existing report</h3>
        <label>Unlinked site report <select name="reportId">{unlinkedReports.map((report) => <option key={report.id} value={report.id}>{when(report.reported_at)} · {report.equipment_label}</option>)}</select></label>
        <button type="submit">Link report to this asset</button>
      </form>}
      {canManage && reports.length > 0 && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "maintenance")}<input type="hidden" name="eventKey" value={`asset-action-${crypto.randomUUID()}`} />
        <h3>Record an attributed maintenance event</h3>
        <label>Fault <select name="reportId">{reports.map((report) => <option key={report.id} value={report.id}>{report.issue_description.slice(0, 80)} · {report.state}</option>)}</select></label>
        <label>Action <select name="actionKind"><option value="triaged">Triaged</option><option value="maintenance_requested">Maintenance requested</option><option value="work_completed">Work completed with evidence</option><option value="return_to_service">Approve return to service</option><option value="correction">Correction event</option></select></label>
        <label>Action notes <textarea name="notes" minLength={3} required /></label>
        <label>Vendor/work reference <input name="vendorReference" /></label>
        <label>Original action ID for correction <input name="correctsActionId" /></label>
        <button type="submit">Save event</button>
      </form>}
      <h2>Source costs</h2>
      <p>Site contract repair responsibility: {repairTerms.length === 1 ? repairTerms[0].repair_responsibility : repairTerms.length > 1 ? "multiple active contracts; review the relevant contract" : "unknown"}. Contract responsibility does not itself establish an invoice or payment.</p>
      {access.canViewFinance ? <>
        <p>{repairTotal === null ? "No single-currency approved repair total is available." :
          `${new Intl.NumberFormat("en-CA", { style: "currency", currency: currency ?? "CAD" }).format(repairTotal)} linked approved operational repair expense at historical sites.`}
          {" "}Accepted accounting rows are reconciliation evidence and are not added to this total.</p>
        <p>Cost per operating hour is unavailable until a reliable period usage denominator exists.</p>
        <ul>{links.map((link) => <li key={link.id}>
          {link.invoice_reference} · {siteNames.get(link.site_id) ?? "Historical site"} · {postingById.get(link.expense_posting_id)?.amount ?? "Amount unavailable"} {postingById.get(link.expense_posting_id)?.currency ?? ""}
          {link.finance_source_row_id ? " · accounting source reference linked; verify current import status" : " · accounting source not linked"}
        </li>)}</ul>
      </> : <p>Repair costs are available only to finance-authorized roles.</p>}
      {director && actions.length > 0 && postings.length > 0 && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "cost")}<h3>Link approved repair expense</h3>
        <label>Maintenance action <select name="actionId">{actions.map((action) => <option key={action.id} value={action.id}>{action.action_kind} · {when(action.recorded_at)}</option>)}</select></label>
        <label>Posted repair expense <select name="postingId">{postings.map((posting) => <option key={posting.id} value={posting.id}>{posting.amount} {posting.currency} · {when(posting.posted_at)} · {siteNames.get(posting.site_id) ?? "Site"}</option>)}</select></label>
        <label>Invoice reference <input name="invoiceReference" minLength={2} required /></label>
        <label>Accepted accounting source row ID, if reconciled <input name="sourceRowId" /></label>
        <button type="submit">Link cost source once</button>
      </form>}
      <h2>Private evidence</h2>
      <p>{evidenceLinks.length} source attachment link{evidenceLinks.length === 1 ? "" : "s"}. Source media remains in its private evidence record; a correction is a new event.</p>
      {canManage && evidenceRows.length > 0 && (inspections.length > 0 || actions.length > 0) && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "evidence")}<h3>Associate existing ready evidence</h3>
        <label>Evidence <select name="evidenceId">{evidenceRows.map((entry) => <option key={entry.id} value={entry.id}>{when(entry.captured_at ?? entry.received_at)} · {entry.id.slice(0, 8)}</option>)}</select></label>
        <label>Inspection <select name="inspectionId"><option value="">None</option>{inspections.map((entry) => <option key={entry.id} value={entry.id}>{when(entry.inspected_at)}</option>)}</select></label>
        <label>Maintenance event <select name="actionId"><option value="">None</option>{actions.map((entry) => <option key={entry.id} value={entry.id}>{entry.action_kind} · {when(entry.recorded_at)}</option>)}</select></label>
        <p>Choose exactly one inspection or maintenance event.</p><button type="submit">Link private evidence</button>
      </form>}
      <h2>Site history</h2><ul>{siteHistory.map((entry) => <li key={entry.id}>
        {siteNames.get(entry.site_id) ?? "Historical site"} · {when(entry.started_at)} to {when(entry.ended_at)} · {entry.reason}
      </li>)}</ul>
      {director && access.sites.length > 1 && <form action={saveEquipmentEvent}>
        {formKind(asset.id, "move")}<h3>Move asset to another site</h3>
        <label>Destination <select name="targetSiteId">{access.sites.filter((site) => site.id !== asset.site_id).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <label>Movement reason <input name="reason" minLength={3} required /></label><button type="submit">Move and preserve history</button>
      </form>}
    </section>
  </AppShell>;
}
