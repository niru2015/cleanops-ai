import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  DEMO_REPORTING_SITE_ID,
  DEMO_REPORTING_WORKER_ID,
  DEMO_REPORTING_ZONE_ID,
  DEMO_SLA_DEFINITION_ID,
} from "@/services/reporting-runtime";

const uuid = z.string().uuid();
const row = async <T>(promise: PromiseLike<{ data: unknown; error: { message?: string } | null }>, schema: z.ZodType<T>) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Reporting data is unavailable.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Reporting data did not match its contract.");
  return parsed.data;
};

const incidentSchema = z.object({
  id: uuid,
  zone_id: uuid,
  reported_by_worker_id: uuid.nullable(),
  occurred_at: z.string(),
  reported_at: z.string(),
  summary: z.string(),
  cause_status: z.literal("undetermined"),
  state: z.string(),
});
const equipmentSchema = z.object({
  id: uuid,
  zone_id: uuid,
  reported_by_worker_id: uuid.nullable(),
  equipment_label: z.string(),
  issue_description: z.string(),
  state: z.string(),
  reported_at: z.string(),
  maintenance_reference: z.string().nullable(),
  resolved_at: z.string().nullable(),
});
const definitionSchema = z.object({
  id: uuid,
  name: z.string(),
  version: z.number().int(),
  window_start: z.string(),
  window_end: z.string(),
  numerator_rule: z.string(),
  denominator_rule: z.string(),
  exclusion_rule: z.string(),
});
const reportSchema = z.object({
  id: uuid,
  state: z.enum(["draft", "released"]),
  due_required_runs: z.number().int(),
  approved_on_time_runs: z.number().int(),
  excluded_runs: z.number().int(),
  completion_rate: z.coerce.number().nullable(),
  incident_count: z.number().int(),
  equipment_report_count: z.number().int(),
  incident_summary: z.string(),
  equipment_summary: z.string(),
  safety_status: z.literal("not_applicable"),
  safety_explanation: z.string(),
  released_at: z.string().nullable(),
});

export type IncidentWorkspace = {
  siteName: string;
  incident: null | {
    id: string;
    time: string;
    summary: string;
    causeStatus: string;
    state: string;
    zone: string;
    worker: string;
    statement: string;
    action: string;
    corrected: boolean;
    timeline: { id: string; time: string; description: string }[];
  };
  equipment: null | {
    id: string;
    time: string;
    label: string;
    issue: string;
    state: string;
    zone: string;
    worker: string;
    maintenanceReference: string | null;
    resolvedAt: string | null;
  };
};

export async function getIncidentWorkspace(client: SupabaseClient): Promise<IncidentWorkspace> {
  const [site, incidents, equipment, zones, workers] = await Promise.all([
    row(client.from("sites").select("name").eq("id", DEMO_REPORTING_SITE_ID).single(), z.object({ name: z.string() })),
    row(client.from("incidents").select("id,zone_id,reported_by_worker_id,occurred_at,reported_at,summary,cause_status,state").eq("site_id", DEMO_REPORTING_SITE_ID).order("occurred_at", { ascending: false }).limit(1), z.array(incidentSchema)),
    row(client.from("equipment_reports").select("id,zone_id,reported_by_worker_id,equipment_label,issue_description,state,reported_at,maintenance_reference,resolved_at").eq("site_id", DEMO_REPORTING_SITE_ID).order("reported_at", { ascending: false }).limit(1), z.array(equipmentSchema)),
    row(client.from("site_zones").select("id,name").eq("site_id", DEMO_REPORTING_SITE_ID), z.array(z.object({ id: uuid, name: z.string() }))),
    row(client.from("workers").select("id,display_name"), z.array(z.object({ id: uuid, display_name: z.string() }))),
  ]);
  const zoneNames = new Map(zones.map((item) => [item.id, item.name]));
  const workerNames = new Map(workers.map((item) => [item.id, item.display_name]));
  const incident = incidents[0];
  const equipmentReport = equipment[0];
  let incidentDetail: IncidentWorkspace["incident"] = null;
  if (incident) {
    const [statements, actions, timeline, corrections] = await Promise.all([
      row(client.from("incident_statements").select("statement_text").eq("incident_id", incident.id).order("attributed_at").limit(1), z.array(z.object({ statement_text: z.string() }))),
      row(client.from("incident_actions").select("note").eq("incident_id", incident.id).order("recorded_at").limit(1), z.array(z.object({ note: z.string() }))),
      row(client.from("incident_timeline_events").select("id,occurred_at,description").eq("incident_id", incident.id).order("occurred_at"), z.array(z.object({ id: uuid, occurred_at: z.string(), description: z.string() }))),
      row(client.from("reporting_audit_events").select("id").eq("entity_type", "incident").eq("entity_id", incident.id).eq("action", "incident.corrected"), z.array(z.object({ id: uuid }))),
    ]);
    incidentDetail = {
      id: incident.id,
      time: "00:17",
      summary: incident.summary,
      causeStatus: incident.cause_status,
      state: incident.state,
      zone: zoneNames.get(incident.zone_id) ?? "Site zone",
      worker: incident.reported_by_worker_id ? workerNames.get(incident.reported_by_worker_id) ?? "Attributed worker" : "Attributed worker",
      statement: statements[0]?.statement_text ?? "No statement recorded.",
      action: actions[0]?.note ?? "No action recorded.",
      corrected: corrections.length > 0,
      timeline: timeline.map((item) => ({ id: item.id, time: new Date(item.occurred_at).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Vancouver" }), description: item.description })),
    };
  }
  return {
    siteName: site.name,
    incident: incidentDetail,
    equipment: equipmentReport ? {
      id: equipmentReport.id,
      time: "02:05",
      label: equipmentReport.equipment_label,
      issue: equipmentReport.issue_description,
      state: equipmentReport.state,
      zone: zoneNames.get(equipmentReport.zone_id) ?? "Site zone",
      worker: equipmentReport.reported_by_worker_id ? workerNames.get(equipmentReport.reported_by_worker_id) ?? "Attributed worker" : "Attributed worker",
      maintenanceReference: equipmentReport.maintenance_reference,
      resolvedAt: equipmentReport.resolved_at,
    } : null,
  };
}

export async function recordDemoIncident(client: SupabaseClient, actorUserId: string) {
  return row(client.rpc("record_incident", {
    p_site_id: DEMO_REPORTING_SITE_ID,
    p_zone_id: DEMO_REPORTING_ZONE_ID,
    p_reported_by_worker_id: DEMO_REPORTING_WORKER_ID,
    p_occurred_at: "2026-09-14T07:17:00Z",
    p_reported_at: "2026-09-14T07:19:00Z",
    p_summary: "A scratch was reported near Slot Bank 14. Cause not determined.",
    p_statement_text: "Worker 182 reported: ‘I noticed a scratch beside Slot Bank 14.’",
    p_action_note: "Supervisor recorded the location and preserved the report for follow-up.",
    p_idempotency_key: "golden-0017-slot-bank-scratch",
    p_actor_user_id: actorUserId,
  }), uuid);
}

export async function correctDemoIncident(client: SupabaseClient, incidentId: string, actorUserId: string) {
  return row(client.rpc("correct_incident_summary", {
    p_incident_id: incidentId,
    p_corrected_summary: "A scratch was reported beside Slot Bank 14 at 00:17. Cause remains undetermined.",
    p_reason: "Clarified the location and retained neutral, non-causal wording.",
    p_actor_user_id: actorUserId,
  }), z.boolean());
}

export async function recordDemoEquipmentReport(client: SupabaseClient, actorUserId: string) {
  return row(client.rpc("record_equipment_report", {
    p_site_id: DEMO_REPORTING_SITE_ID,
    p_zone_id: DEMO_REPORTING_ZONE_ID,
    p_reported_by_worker_id: DEMO_REPORTING_WORKER_ID,
    p_reported_at: "2026-09-14T09:05:00Z",
    p_equipment_label: "Walk-behind scrubber 04",
    p_issue_description: "Operator reported that the scrubber was pulling to the right.",
    p_idempotency_key: "golden-0205-scrubber-pulling-right",
    p_actor_user_id: actorUserId,
  }), uuid);
}

export type SupervisorReportWorkspace = {
  siteName: string;
  clientName: string;
  definition: z.infer<typeof definitionSchema>;
  report: z.infer<typeof reportSchema> | null;
  audit: { id: string; action: string; reason: string | null; createdAt: string }[];
};

export async function getSupervisorReportWorkspace(client: SupabaseClient): Promise<SupervisorReportWorkspace> {
  const [site, definition, reports, audit] = await Promise.all([
    row(client.from("sites").select("name,client_id").eq("id", DEMO_REPORTING_SITE_ID).single(), z.object({ name: z.string(), client_id: uuid })),
    row(client.from("sla_definitions").select("id,name,version,window_start,window_end,numerator_rule,denominator_rule,exclusion_rule").eq("id", DEMO_SLA_DEFINITION_ID).single(), definitionSchema),
    row(client.from("client_service_reports").select("id,state,due_required_runs,approved_on_time_runs,excluded_runs,completion_rate,incident_count,equipment_report_count,incident_summary,equipment_summary,safety_status,safety_explanation,released_at").eq("sla_definition_id", DEMO_SLA_DEFINITION_ID).limit(1), z.array(reportSchema)),
    row(client.from("reporting_audit_events").select("id,action,reason,created_at").eq("entity_type", "client_report").order("created_at"), z.array(z.object({ id: uuid, action: z.string(), reason: z.string().nullable(), created_at: z.string() }))),
  ]);
  const clientName = await row(client.from("clients").select("name").eq("id", site.client_id).single(), z.object({ name: z.string() }));
  return { siteName: site.name, clientName: clientName.name, definition, report: reports[0] ?? null, audit: audit.map((item) => ({ id: item.id, action: item.action, reason: item.reason, createdAt: item.created_at })) };
}

export async function prepareDemoReport(client: SupabaseClient, actorUserId: string) {
  return row(client.rpc("prepare_client_service_report", { p_sla_definition_id: DEMO_SLA_DEFINITION_ID, p_actor_user_id: actorUserId }), uuid);
}

export async function releaseDemoReport(client: SupabaseClient, reportId: string, actorUserId: string) {
  return row(client.rpc("release_client_service_report", { p_report_id: reportId, p_reason: "Supervisor reviewed the redacted shift report for client release.", p_actor_user_id: actorUserId }), z.boolean());
}

const clientReportSchema = z.object({
  report_id: uuid,
  client_name: z.string(),
  site_name: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  definition_name: z.string(),
  definition_version: z.number().int(),
  numerator_rule: z.string(),
  denominator_rule: z.string(),
  exclusion_rule: z.string(),
  due_required_runs: z.number().int(),
  approved_on_time_runs: z.number().int(),
  excluded_runs: z.number().int(),
  completion_rate: z.coerce.number().nullable(),
  incident_count: z.number().int(),
  equipment_report_count: z.number().int(),
  incident_summary: z.string(),
  equipment_summary: z.string(),
  safety_status: z.literal("not_applicable"),
  safety_explanation: z.string(),
  released_at: z.string(),
});
export type ClientReportWorkspace = z.infer<typeof clientReportSchema>;

export async function getClientReportWorkspace(client: SupabaseClient, actorUserId: string): Promise<ClientReportWorkspace | null> {
  const reports = await row(client.from("client_service_reports").select("id").eq("site_id", DEMO_REPORTING_SITE_ID).eq("state", "released").order("released_at", { ascending: false }).limit(1), z.array(z.object({ id: uuid })));
  const report = reports[0];
  if (!report) return null;
  const released = await row(client.rpc("get_released_client_service_report", { p_report_id: report.id, p_actor_user_id: actorUserId }), z.array(clientReportSchema));
  return released[0] ?? null;
}
