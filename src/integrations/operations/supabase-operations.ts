import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEMO_ORGANIZATION_ID, DEMO_SHIFT_ID, DEMO_SITE_ID } from "@/services/operations-runtime";

const uuid = z.string().uuid();
const row = async <T>(promise: PromiseLike<{ data: unknown; error: { message?: string } | null }>, schema: z.ZodType<T>) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Operations data is unavailable.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Operations data did not match its contract.");
  return parsed.data;
};

const coverageSchema = z.array(z.object({ required_positions: z.number().int(), present_workers: z.number().int(), coverage_gap: z.number().int() }));
const candidateSchema = z.object({ id: uuid, display_name: z.string() });
const assignmentSchema = z.object({ id: uuid, worker_id: uuid });

export type OperationsWorkspace = {
  siteName: string;
  coverage: { required: number; present: number; gap: number };
  timeline: { time: string; present: number; required: number }[];
  zones: { id: string; name: string; task: string; state: string; due: string }[];
  candidates: { id: string; name: string; selected: boolean; checkedIn: boolean }[];
  outstandingReviews: number;
  openCorrections: number;
  slaRisks: number;
};

async function coverageAt(client: SupabaseClient, at: string) {
  const result = await row(client.rpc("get_shift_coverage_at", { p_shift_id: DEMO_SHIFT_ID, p_at: at }), coverageSchema);
  const value = result[0];
  if (!value) throw new Error("Coverage requirement is unavailable.");
  return { required: value.required_positions, present: value.present_workers, gap: value.coverage_gap };
}

export async function getOperationsWorkspace(client: SupabaseClient): Promise<OperationsWorkspace> {
  const [site, current, at2245, at2305, at2310, zones, tasks, runs, candidates, selections, assignments, attendance, reviews, corrections] = await Promise.all([
    row(client.from("sites").select("name").eq("id", DEMO_SITE_ID).single(), z.object({ name: z.string() })),
    coverageAt(client, "2026-09-14T06:10:00Z"),
    coverageAt(client, "2026-09-14T05:45:00Z"),
    coverageAt(client, "2026-09-14T06:05:00Z"),
    coverageAt(client, "2026-09-14T06:10:00Z"),
    row(client.from("site_zones").select("id,name").eq("site_id", DEMO_SITE_ID), z.array(z.object({ id: uuid, name: z.string() }))),
    row(client.from("service_tasks").select("id,name").eq("site_id", DEMO_SITE_ID).eq("active", true), z.array(z.object({ id: uuid, name: z.string() }))),
    row(client.from("task_runs").select("id,task_id,zone_id,state,due_at").eq("site_id", DEMO_SITE_ID), z.array(z.object({ id: uuid, task_id: uuid, zone_id: uuid, state: z.string(), due_at: z.string() }))),
    row(client.from("workers").select("id,display_name").eq("organization_id", DEMO_ORGANIZATION_ID).ilike("display_name", "Replacement candidate%"), z.array(candidateSchema)),
    row(client.from("replacement_selections").select("worker_id,assignment_id").eq("shift_id", DEMO_SHIFT_ID), z.array(z.object({ worker_id: uuid, assignment_id: uuid.nullable() }))),
    row(client.from("shift_assignments").select("id,worker_id").eq("shift_id", DEMO_SHIFT_ID), z.array(assignmentSchema)),
    row(client.from("attendance_events").select("assignment_id,event_type").eq("site_id", DEMO_SITE_ID), z.array(z.object({ assignment_id: uuid, event_type: z.string() }))),
    row(client.from("task_runs").select("id", { count: "exact" }).eq("site_id", DEMO_SITE_ID).eq("state", "submitted"), z.array(z.object({ id: uuid }))),
    row(client.from("corrective_actions").select("id").eq("site_id", DEMO_SITE_ID).in("state", ["open", "submitted"]), z.array(z.object({ id: uuid }))),
  ]);

  const taskById = new Map(tasks.map((item) => [item.id, item.name]));
  const activeTaskIds = new Set(tasks.map((item) => item.id));
  const runByZone = new Map(runs.filter((item) => activeTaskIds.has(item.task_id)).map((item) => [item.zone_id, item]));
  const selectionByWorker = new Map(selections.map((item) => [item.worker_id, item]));
  const assignmentByWorker = new Map(assignments.map((item) => [item.worker_id, item]));
  const checkedIn = new Set(attendance.filter((item) => item.event_type === "check_in").map((item) => item.assignment_id));

  return {
    siteName: site.name,
    coverage: current,
    timeline: [
      { time: "22:45", present: at2245.present, required: at2245.required },
      { time: "23:05", present: at2305.present, required: at2305.required },
      { time: "23:10", present: at2310.present, required: at2310.required },
    ],
    zones: zones.map((zone) => {
      const run = runByZone.get(zone.id);
      return { id: zone.id, name: zone.name, task: run ? taskById.get(run.task_id) ?? "Service task" : "No task scheduled", state: run?.state ?? "empty", due: run?.due_at ?? "" };
    }),
    candidates: candidates.map((candidate) => {
      const assignment = assignmentByWorker.get(candidate.id);
      return { id: candidate.id, name: candidate.display_name, selected: selectionByWorker.has(candidate.id), checkedIn: assignment ? checkedIn.has(assignment.id) : false };
    }),
    outstandingReviews: reviews.length,
    openCorrections: corrections.length,
    slaRisks: runs.filter((run) => ["planned", "ready", "in_progress", "correction_required"].includes(run.state) && new Date(run.due_at) <= new Date("2026-09-14T06:30:00Z")).length,
  };
}

export async function selectReplacement(client: SupabaseClient, workerId: string, actorUserId: string) {
  const permission = await row(client.from("worker_site_permissions").select("worker_id,state").eq("worker_id", workerId).eq("site_id", DEMO_SITE_ID).single(), z.object({ worker_id: uuid, state: z.literal("active") }));
  if (permission.worker_id !== workerId) throw new Error("Candidate is not eligible for this site.");
  const priorSelections = await row(client.from("replacement_selections").select("id").eq("shift_id", DEMO_SHIFT_ID), z.array(z.object({ id: uuid })));

  const assignmentId = randomUUID();
  const { error: assignmentError } = await client.from("shift_assignments").insert({ id: assignmentId, organization_id: DEMO_ORGANIZATION_ID, site_id: DEMO_SITE_ID, shift_id: DEMO_SHIFT_ID, worker_id: workerId });
  if (assignmentError && assignmentError.code !== "23505") throw new Error(assignmentError.message);
  const existing = await row(client.from("shift_assignments").select("id,worker_id").eq("shift_id", DEMO_SHIFT_ID).eq("worker_id", workerId).single(), assignmentSchema);
  const selectedAt = priorSelections.length === 0 ? "2026-09-14T05:51:00Z" : "2026-09-14T06:07:00Z";
  const { error } = await client.from("replacement_selections").upsert({ organization_id: DEMO_ORGANIZATION_ID, site_id: DEMO_SITE_ID, shift_id: DEMO_SHIFT_ID, worker_id: workerId, assignment_id: existing.id, selected_by: actorUserId, selected_at: selectedAt }, { onConflict: "shift_id,worker_id" });
  if (error) throw new Error(error.message);
}

export async function checkInReplacement(client: SupabaseClient, workerId: string, actorUserId: string) {
  const assignments = await row(client.from("shift_assignments").select("id,worker_id").eq("shift_id", DEMO_SHIFT_ID).eq("worker_id", workerId), z.array(assignmentSchema));
  const assignment = assignments[0];
  if (!assignment) throw new Error("Select and assign this replacement before check-in.");
  const existing = await row(client.from("attendance_events").select("id").eq("assignment_id", assignment.id).eq("event_type", "check_in"), z.array(z.object({ id: uuid })));
  if (existing.length) return;
  const allSelections = await row(client.from("replacement_selections").select("worker_id,selected_at").eq("shift_id", DEMO_SHIFT_ID).order("selected_at"), z.array(z.object({ worker_id: uuid, selected_at: z.string() })));
  const index = allSelections.findIndex((item) => item.worker_id === workerId);
  const occurredAt = index <= 0 ? "2026-09-14T06:05:00Z" : "2026-09-14T06:10:00Z";
  const { error } = await client.from("attendance_events").insert({ organization_id: DEMO_ORGANIZATION_ID, site_id: DEMO_SITE_ID, assignment_id: assignment.id, event_type: "check_in", occurred_at: occurredAt, recorded_by: actorUserId });
  if (error) throw new Error(error.message);
}

export type MobileWorkspace = { taskId: string; taskName: string; zoneName: string; state: string; contextSelected: boolean; beforeReady: boolean; afterReady: boolean };

export async function getMobileWorkspace(client: SupabaseClient, taskRunId: string): Promise<MobileWorkspace> {
  const task = await row(client.from("task_runs").select("id,task_id,zone_id,state").eq("id", taskRunId).single(), z.object({ id: uuid, task_id: uuid, zone_id: uuid, state: z.string() }));
  const [taskName, zone, contexts, evidence] = await Promise.all([
    row(client.from("service_tasks").select("name").eq("id", task.task_id).single(), z.object({ name: z.string() })),
    row(client.from("site_zones").select("name").eq("id", task.zone_id).single(), z.object({ name: z.string() })),
    row(client.from("conversation_contexts").select("id").eq("task_run_id", task.id).eq("external_thread_id", "cleanops-mobile-demo"), z.array(z.object({ id: uuid }))),
    row(client.from("task_evidence").select("role,processing_status,linkage_status").eq("task_run_id", task.id), z.array(z.object({ role: z.string().nullable(), processing_status: z.string(), linkage_status: z.string() }))),
  ]);
  const readyRoles = new Set(evidence.filter((item) => item.processing_status === "ready" && item.linkage_status === "linked").map((item) => item.role));
  return { taskId: task.id, taskName: taskName.name, zoneName: zone.name, state: task.state, contextSelected: contexts.length > 0, beforeReady: readyRoles.has("before"), afterReady: readyRoles.has("after") };
}

export async function selectMobileZone(client: SupabaseClient, taskRunId: string) {
  const existing = await row(client.from("conversation_contexts").select("id").eq("external_thread_id", "cleanops-mobile-demo").eq("task_run_id", taskRunId), z.array(z.object({ id: uuid })));
  if (existing.length) return;
  const { error } = await client.from("conversation_contexts").insert({ organization_id: DEMO_ORGANIZATION_ID, integration_account_id: "c0000000-0000-4000-8000-000000000001", external_thread_id: "cleanops-mobile-demo", external_sender_id: "worker-182", assignment_id: "a0000000-0000-4000-8000-000000000001", site_id: DEMO_SITE_ID, zone_id: "50000000-0000-4000-8000-000000000004", task_run_id: taskRunId, starts_at: "2026-09-14T06:14:00Z", expires_at: "2026-09-14T06:44:00Z" });
  if (error) throw new Error(error.message);
}
