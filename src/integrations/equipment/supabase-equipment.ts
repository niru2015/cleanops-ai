import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AppAccessContext } from "@/services/access-context";

const uuid = z.string().uuid();
const model = z.object({ manufacturer: z.string(), model_name: z.string(), category: z.string() }).nullable();
const asset = z.object({ id: uuid, organization_id: uuid, site_id: uuid, model_id: uuid,
  asset_code: z.string(), status: z.string(), condition: z.string(), serial_number: z.string().nullable(),
  runtime_hours: z.number().nullable(), acquired_on: z.string().nullable(),
  last_service_date: z.string().nullable(), next_service_date: z.string().nullable(),
  equipment_models: model });
const history = z.object({ id: uuid, site_id: uuid, started_at: z.string(), ended_at: z.string().nullable(), reason: z.string() });
const checklist = z.object({ id: uuid, version_number: z.number(), source_kind: z.string(),
  source_reference: z.string(), instructions: z.array(z.unknown()), approved_at: z.string() });
const inspection = z.object({ id: uuid, site_id: uuid, checklist_version_id: uuid,
  operator_user_id: uuid.nullable(), inspector_user_id: uuid, inspected_at: z.string(),
  outcome: z.string(), answers: z.record(z.string(), z.unknown()), notes: z.string(), follow_up_due_at: z.string().nullable() });
const report = z.object({ id: uuid, site_id: uuid, asset_id: uuid.nullable(), equipment_label: z.string(),
  issue_description: z.string(), state: z.string(), reported_at: z.string(), created_by: uuid });
const action = z.object({ id: uuid, site_id: uuid, report_id: uuid, action_kind: z.string(),
  notes: z.string(), vendor_reference: z.string().nullable(), performed_by: uuid,
  recorded_at: z.string(), corrects_action_id: uuid.nullable() });
const costLink = z.object({ id: uuid, site_id: uuid, maintenance_action_id: uuid,
  expense_posting_id: uuid, finance_source_row_id: uuid.nullable(), invoice_reference: z.string() });
const posting = z.object({ id: uuid, site_id: uuid, amount: z.number(), currency: z.string(),
  posted_at: z.string(), category: z.string() });
const zone = z.object({ id: uuid, name: z.string() });
const worker = z.object({ id: uuid, display_name: z.string(), auth_user_id: uuid.nullable() });
const evidence = z.object({ id: uuid, site_id: uuid.nullable(), processing_status: z.string(),
  captured_at: z.string().nullable(), received_at: z.string() });
const evidenceLink = z.object({ id: uuid, task_evidence_id: uuid, inspection_id: uuid.nullable(), maintenance_action_id: uuid.nullable(), site_id: uuid });
const responsibility = z.object({ id: uuid, repair_responsibility: z.string(), effective_from: z.string().nullable(), effective_to: z.string().nullable() });

async function checked<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T> {
  const result = await request;
  if (result.error) throw new Error(result.error.message);
  return schema.parse(result.data);
}

export async function listEquipmentAssets(client: SupabaseClient, access: AppAccessContext) {
  const siteIds = access.sites.map((site) => site.id);
  if (!siteIds.length) return [];
  return checked(client.from("equipment_assets")
    .select("id,organization_id,site_id,model_id,asset_code,status,condition,serial_number,runtime_hours,acquired_on,last_service_date,next_service_date,equipment_models(manufacturer,model_name,category)")
    .eq("organization_id", access.organizationId).in("site_id", siteIds).order("asset_code"), z.array(asset));
}

export async function getEquipmentAssetDetail(client: SupabaseClient, access: AppAccessContext, assetId: string) {
  const assets = await checked(client.from("equipment_assets")
    .select("id,organization_id,site_id,model_id,asset_code,status,condition,serial_number,runtime_hours,acquired_on,last_service_date,next_service_date,equipment_models(manufacturer,model_name,category)")
    .eq("organization_id", access.organizationId).eq("id", assetId).limit(1), z.array(asset));
  const selected = assets[0];
  if (!selected || !access.sites.some((site) => site.id === selected.site_id)) return null;
  const canFinance = access.canViewFinance;
  const [siteHistory, checklists, inspections, reports, actions, links, zones, workers, evidenceRows, evidenceLinks, repairTerms] = await Promise.all([
    checked(client.from("equipment_asset_site_history").select("id,site_id,started_at,ended_at,reason")
      .eq("organization_id", access.organizationId).eq("asset_id", assetId).order("started_at", { ascending: false }), z.array(history)),
    checked(client.from("equipment_checklist_versions").select("id,version_number,source_kind,source_reference,instructions,approved_at")
      .eq("organization_id", access.organizationId).eq("model_id", selected.model_id).order("version_number", { ascending: false }), z.array(checklist)),
    checked(client.from("equipment_inspections").select("id,site_id,checklist_version_id,operator_user_id,inspector_user_id,inspected_at,outcome,answers,notes,follow_up_due_at")
      .eq("organization_id", access.organizationId).eq("asset_id", assetId).order("inspected_at", { ascending: false }), z.array(inspection)),
    checked(client.from("equipment_reports").select("id,site_id,asset_id,equipment_label,issue_description,state,reported_at,created_by")
      .eq("organization_id", access.organizationId).eq("asset_id", assetId).order("reported_at", { ascending: false }), z.array(report)),
    checked(client.from("equipment_maintenance_actions").select("id,site_id,report_id,action_kind,notes,vendor_reference,performed_by,recorded_at,corrects_action_id")
      .eq("organization_id", access.organizationId).eq("asset_id", assetId).order("recorded_at", { ascending: false }), z.array(action)),
    canFinance ? checked(client.from("equipment_repair_cost_links")
      .select("id,site_id,maintenance_action_id,expense_posting_id,finance_source_row_id,invoice_reference")
      .eq("organization_id", access.organizationId).eq("asset_id", assetId), z.array(costLink)) : Promise.resolve([]),
    checked(client.from("site_zones").select("id,name").eq("organization_id", access.organizationId)
      .eq("site_id", selected.site_id).order("name"), z.array(zone)),
    checked(client.from("workers").select("id,display_name,auth_user_id").eq("organization_id", access.organizationId)
      .order("display_name").limit(300), z.array(worker)),
    checked(client.from("task_evidence").select("id,site_id,processing_status,captured_at,received_at")
      .eq("organization_id", access.organizationId).eq("site_id", selected.site_id)
      .eq("processing_status", "ready").order("received_at", { ascending: false }).limit(50), z.array(evidence)),
    checked(client.from("equipment_evidence_links").select("id,task_evidence_id,inspection_id,maintenance_action_id,site_id")
      .eq("organization_id", access.organizationId).eq("asset_id", assetId), z.array(evidenceLink)),
    checked(client.from("contract_versions").select("id,repair_responsibility,effective_from,effective_to")
      .eq("organization_id", access.organizationId).eq("site_id", selected.site_id).eq("state", "active")
      .order("effective_from", { ascending: false }).limit(10), z.array(responsibility)),
  ]);
  const siteIds = [...new Set(siteHistory.map((entry) => entry.site_id))];
  const [postings, unlinkedReports] = await Promise.all([
    canFinance && siteIds.length ? checked(client.from("expense_postings")
      .select("id,site_id,amount,currency,posted_at,category")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .eq("category", "equipment_repair").order("posted_at", { ascending: false }).limit(100), z.array(posting)) : Promise.resolve([]),
    checked(client.from("equipment_reports").select("id,site_id,asset_id,equipment_label,issue_description,state,reported_at,created_by")
      .eq("organization_id", access.organizationId).eq("site_id", selected.site_id).is("asset_id", null)
      .order("reported_at", { ascending: false }).limit(30), z.array(report)),
  ]);
  return { asset: selected, siteHistory, checklists, inspections, reports, actions, links,
    zones, workers, evidenceRows, evidenceLinks, postings, unlinkedReports, repairTerms,
    loadedAt: new Date().toISOString() };
}
