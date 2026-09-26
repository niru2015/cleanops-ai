"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";

const uuid = z.string().uuid();
const shortText = z.string().trim().min(3).max(500);
function value(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function optionalUuid(form: FormData, key: string) { const raw = value(form, key); return raw ? uuid.parse(raw) : null; }

export async function saveEquipmentEvent(form: FormData) {
  const assetId = uuid.parse(value(form, "assetId"));
  let message = "Saved";
  let error = "";
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const result = await client.from("equipment_assets").select("id,site_id,organization_id,model_id,asset_code")
      .eq("id", assetId).eq("organization_id", access.organizationId).maybeSingle();
    const asset = result.data;
    if (result.error || !asset || !isSiteAllowed(access, asset.site_id) ||
      !["site_supervisor", "area_manager", "operations_manager", "organization_administrator"].includes(access.role))
      throw new Error("Asset access is unavailable.");
    const kind = value(form, "kind");
    let response: { error: { message: string } | null };
    if (kind === "checklist") {
      if (!access.canEditFinance) throw new Error("Director approval is required.");
      const instructions = value(form, "instructions").split(/\r?\n/).map((step) => step.trim()).filter(Boolean);
      if (instructions.length === 0 || instructions.length > 30 || instructions.some((step) => step.length > 500))
        throw new Error("Enter 1–30 source-backed checklist steps.");
      response = await client.rpc("create_equipment_checklist_version", {
        p_model_id: uuid.parse(value(form, "modelId")),
        p_source_kind: z.enum(["manufacturer", "customer_approved"]).parse(value(form, "sourceKind")),
        p_source_reference: shortText.parse(value(form, "sourceReference")), p_instructions: instructions });
      message = "Checklist version approved";
    } else if (kind === "inspection") {
      const checklistId = uuid.parse(value(form, "checklistId"));
      const checklist = await client.from("equipment_checklist_versions").select("instructions")
        .eq("id", checklistId).eq("organization_id", access.organizationId)
        .eq("model_id", asset.model_id).maybeSingle();
      const steps = z.array(z.string()).min(1).parse(checklist.data?.instructions);
      if (checklist.error) throw new Error(checklist.error.message);
      const answers = Object.fromEntries(steps.map((_, index) => [String(index),
        z.enum(["care_ok", "follow_up_required", "not_checked"]).parse(value(form, `step-${index}`))]));
      response = await client.rpc("record_equipment_inspection", {
        p_asset_id: assetId, p_checklist_version_id: checklistId,
        p_operator_user_id: optionalUuid(form, "operatorId"),
        p_outcome: z.enum(["care_ok", "follow_up_required"]).parse(value(form, "outcome")),
        p_answers: answers, p_notes: value(form, "notes"),
        p_follow_up_due_at: value(form, "followUpDueAt")
          ? z.coerce.date().parse(value(form, "followUpDueAt")).toISOString() : null });
      message = "Inspection recorded";
    } else if (kind === "fault") {
      const report = await client.rpc("record_equipment_report", {
        p_site_id: asset.site_id, p_zone_id: uuid.parse(value(form, "zoneId")),
        p_reported_by_worker_id: uuid.parse(value(form, "workerId")),
        p_reported_at: new Date().toISOString(), p_equipment_label: asset.asset_code,
        p_issue_description: z.string().trim().min(3).max(1000).parse(value(form, "description")),
        p_idempotency_key: z.string().min(3).max(180).parse(value(form, "eventKey")) });
      if (report.error || typeof report.data !== "string") throw new Error(report.error?.message ?? "Fault report could not be saved.");
      response = await client.rpc("link_equipment_report_asset", { p_report_id: report.data, p_asset_id: assetId });
      message = "Neutral fault report recorded";
    } else if (kind === "linkFault") {
      response = await client.rpc("link_equipment_report_asset", {
        p_report_id: uuid.parse(value(form, "reportId")), p_asset_id: assetId });
      message = "Existing fault linked";
    } else if (kind === "maintenance") {
      response = await client.rpc("record_equipment_maintenance_action", {
        p_report_id: uuid.parse(value(form, "reportId")),
        p_event_key: z.string().min(3).max(180).parse(value(form, "eventKey")),
        p_action_kind: z.enum(["triaged", "maintenance_requested", "work_completed", "return_to_service", "correction"]).parse(value(form, "actionKind")),
        p_notes: shortText.parse(value(form, "notes")),
        p_vendor_reference: value(form, "vendorReference") || null,
        p_corrects_action_id: optionalUuid(form, "correctsActionId") });
      message = "Maintenance history recorded";
    } else if (kind === "cost") {
      if (!access.canEditFinance) throw new Error("Director repair-cost access is required.");
      response = await client.rpc("link_equipment_repair_cost", {
        p_action_id: uuid.parse(value(form, "actionId")),
        p_expense_posting_id: uuid.parse(value(form, "postingId")),
        p_invoice_reference: z.string().trim().min(2).max(180).parse(value(form, "invoiceReference")),
        p_finance_source_row_id: optionalUuid(form, "sourceRowId") });
      message = "Approved expense linked once";
    } else if (kind === "evidence") {
      response = await client.rpc("link_equipment_evidence", {
        p_task_evidence_id: uuid.parse(value(form, "evidenceId")),
        p_inspection_id: optionalUuid(form, "inspectionId"),
        p_maintenance_action_id: optionalUuid(form, "actionId") });
      message = "Private evidence linked";
    } else if (kind === "move") {
      if (!access.canEditFinance) throw new Error("Director asset movement access is required.");
      response = await client.rpc("move_equipment_asset", {
        p_asset_id: assetId, p_target_site_id: uuid.parse(value(form, "targetSiteId")),
        p_reason: shortText.parse(value(form, "reason")) });
      message = "Asset moved with history preserved";
    } else throw new Error("Unknown equipment action.");
    if (response.error) throw new Error(response.error.message);
    revalidatePath("/equipment");
    revalidatePath(`/equipment/${assetId}`);
  } catch (caught) {
    error = caught instanceof z.ZodError ? caught.issues[0]?.message ?? "Check the form." :
      caught instanceof Error ? caught.message : "The equipment event could not be saved.";
  }
  redirect(`/equipment/${assetId}?${error ? `error=${encodeURIComponent(error)}` : `saved=${encodeURIComponent(message)}`}`);
}
