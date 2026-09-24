import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { QualityAssessment } from "@/schemas/quality";

const uuid = z.string().uuid();

const taskSchema = z.object({
  id: uuid,
  organization_id: uuid,
  site_id: uuid,
  task_id: uuid,
  zone_id: uuid,
  state: z.string(),
  submission_revision: z.number().int().nonnegative(),
  scheduled_at: z.string(),
  due_at: z.string(),
});

const pairSchema = z.object({
  id: uuid,
  submission_revision: z.number().int().positive(),
  before_evidence_id: uuid,
  after_evidence_id: uuid,
  created_at: z.string(),
});

const evidencePreviewSchema = z.object({
  id: uuid,
  role: z.enum(["before", "after"]),
  submission_revision: z.number().int().positive(),
  captured_at: z.string().nullable(),
  received_at: z.string(),
  worker_id: uuid.nullable(),
  submitted_by_user_id: uuid.nullable(),
});

const decisionSchema = z.object({
  id: uuid,
  submission_revision: z.number().int().positive(),
  source_label: z.string(),
  status: z.enum(["assessed", "insufficient_evidence", "failed"]),
  score: z.number().nullable(),
  confidence: z.number().nullable(),
  observations: z.array(z.object({
    criterion_id: z.string(),
    observation: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    evidence_ids: z.array(uuid),
  }).passthrough()),
  limitations: z.array(z.string()),
  error_code: z.string().nullable(),
  created_at: z.string(),
});

const findingSchema = z.object({
  id: uuid,
  submission_revision: z.number().int().positive(),
  criterion_id: z.string(),
  observation: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  confirmed_at: z.string(),
  resolved_at: z.string().nullable(),
});

const actionSchema = z.object({
  id: uuid,
  source_revision: z.number().int().positive(),
  target_revision: z.number().int().positive().nullable(),
  state: z.enum(["open", "submitted", "closed"]),
  instruction: z.string(),
  requested_at: z.string(),
  submitted_at: z.string().nullable(),
  closed_at: z.string().nullable(),
});

const inspectionSchema = z.object({
  id: uuid,
  submission_revision: z.number().int().positive(),
  outcome: z.enum(["correction_required", "approved"]),
  reason: z.string().nullable(),
  created_at: z.string(),
});

const auditSchema = z.object({
  id: uuid,
  submission_revision: z.number().int().positive(),
  action: z.string(),
  details: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

export type ReviewWorkspace = {
  task: z.infer<typeof taskSchema>;
  taskName: string;
  zoneName: string;
  siteName: string;
  pair: z.infer<typeof pairSchema> | null;
  evidence: { before: z.infer<typeof evidencePreviewSchema> | null; after: z.infer<typeof evidencePreviewSchema> | null };
  decision: z.infer<typeof decisionSchema> | null;
  findings: z.infer<typeof findingSchema>[];
  correctiveActions: z.infer<typeof actionSchema>[];
  inspections: z.infer<typeof inspectionSchema>[];
  auditEvents: z.infer<typeof auditSchema>[];
};

export class ReviewRepositoryError extends Error {
  constructor(readonly code: "not_found" | "denied" | "stale" | "unavailable") {
    super(code);
  }
}

function mapError(error: { code?: string; message?: string } | null) {
  if (error?.code === "42501" || error?.message?.includes("not_authorized")) return new ReviewRepositoryError("denied");
  if (error?.code === "40001" || error?.message?.includes("stale")) return new ReviewRepositoryError("stale");
  if (error?.code === "PGRST116" || error?.code === "P0002") return new ReviewRepositoryError("not_found");
  return new ReviewRepositoryError("unavailable");
}

async function rows<T>(promise: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>, schema: z.ZodType<T>) {
  const { data, error } = await promise;
  if (error) throw mapError(error);
  const parsed = z.array(schema).safeParse(data ?? []);
  if (!parsed.success) throw new ReviewRepositoryError("unavailable");
  return parsed.data;
}

export async function getReviewWorkspace(client: SupabaseClient, taskRunId: string): Promise<ReviewWorkspace> {
  const taskRows = await rows(
    client.from("task_runs").select("id,organization_id,site_id,task_id,zone_id,state,submission_revision,scheduled_at,due_at").eq("id", taskRunId),
    taskSchema,
  );
  const task = taskRows[0];
  if (!task) throw new ReviewRepositoryError("not_found");

  const [taskNames, zoneNames, siteNames, pairs, decisions, findings, correctiveActions, inspections, auditEvents] = await Promise.all([
    rows(client.from("service_tasks").select("name").eq("id", task.task_id), z.object({ name: z.string() })),
    rows(client.from("site_zones").select("name").eq("id", task.zone_id), z.object({ name: z.string() })),
    rows(client.from("sites").select("name").eq("id", task.site_id), z.object({ name: z.string() })),
    rows(client.from("evidence_pairs").select("id,submission_revision,before_evidence_id,after_evidence_id,created_at").eq("task_run_id", task.id).order("submission_revision", { ascending: false }), pairSchema),
    rows(client.from("quality_decisions").select("id,submission_revision,source_label,status,score,confidence,observations,limitations,error_code,created_at").eq("task_run_id", task.id).order("created_at", { ascending: false }), decisionSchema),
    rows(client.from("quality_findings").select("id,submission_revision,criterion_id,observation,severity,confirmed_at,resolved_at").eq("task_run_id", task.id).order("confirmed_at", { ascending: true }), findingSchema),
    rows(client.from("corrective_actions").select("id,source_revision,target_revision,state,instruction,requested_at,submitted_at,closed_at").eq("task_run_id", task.id).order("requested_at", { ascending: true }), actionSchema),
    rows(client.from("inspections").select("id,submission_revision,outcome,reason,created_at").eq("task_run_id", task.id).order("created_at", { ascending: true }), inspectionSchema),
    rows(client.from("review_audit_events").select("id,submission_revision,action,details,created_at").eq("task_run_id", task.id).order("created_at", { ascending: true }), auditSchema),
  ]);

  const pair = pairs.find((item) => item.submission_revision === task.submission_revision) ?? null;
  const evidenceRows = pair ? await rows(
    client.from("task_evidence")
      .select("id,role,submission_revision,captured_at,received_at,worker_id,submitted_by_user_id")
      .in("id", [pair.before_evidence_id, pair.after_evidence_id]),
    evidencePreviewSchema,
  ) : [];

  return {
    task,
    taskName: taskNames[0]?.name ?? "Service task",
    zoneName: zoneNames[0]?.name ?? "Assigned zone",
    siteName: siteNames[0]?.name ?? "Authorized site",
    pair,
    evidence: {
      before: evidenceRows.find((item) => item.id === pair?.before_evidence_id) ?? null,
      after: evidenceRows.find((item) => item.id === pair?.after_evidence_id) ?? null,
    },
    decision: decisions.find((item) => item.submission_revision === task.submission_revision) ?? null,
    findings,
    correctiveActions,
    inspections,
    auditEvents,
  };
}

export async function recordQualityAssessment(client: SupabaseClient, assessment: QualityAssessment) {
  const { data, error } = await client.rpc("record_quality_decision", {
    p_task_run_id: assessment.task_run_id,
    p_submission_revision: assessment.submission_revision,
    p_request_key: `mock-quality:${assessment.task_run_id}:${assessment.submission_revision}:v1`,
    p_service_name: "visual_quality",
    p_service_version: "mock-v1",
    p_source_label: "Mock AI",
    p_status: assessment.status,
    p_score: assessment.score,
    p_confidence: assessment.confidence,
    p_observations: assessment.findings,
    p_limitations: assessment.limitations,
    p_error_code: null,
  });
  if (error || typeof data !== "string") throw mapError(error);
  return data;
}

export async function recordQualityFailure(client: SupabaseClient, taskRunId: string, revision: number) {
  const { data, error } = await client.rpc("record_quality_decision", {
    p_task_run_id: taskRunId,
    p_submission_revision: revision,
    p_request_key: `mock-quality-failure:${taskRunId}:${revision}:v1`,
    p_service_name: "visual_quality",
    p_service_version: "mock-v1",
    p_source_label: "Mock AI",
    p_status: "failed",
    p_score: null,
    p_confidence: null,
    p_observations: [],
    p_limitations: ["Mock service failure; complete a manual review."],
    p_error_code: "mock_provider_unavailable",
  });
  if (error || typeof data !== "string") throw mapError(error);
  return data;
}

export async function confirmSuggestion(client: SupabaseClient, input: {
  decisionId: string; revision: number; criterionId: string; instruction: string; actorUserId: string | null;
}) {
  const { data, error } = await client.rpc("confirm_quality_suggestion", {
    p_decision_id: input.decisionId,
    p_expected_revision: input.revision,
    p_criterion_id: input.criterionId,
    p_instruction: input.instruction,
    p_actor_user_id: input.actorUserId,
  });
  if (error || typeof data !== "string") throw mapError(error);
  return data;
}

export async function dismissSuggestion(client: SupabaseClient, input: {
  decisionId: string; revision: number; criterionId: string; reason: string; actorUserId: string | null;
}) {
  const { data, error } = await client.rpc("dismiss_quality_suggestion", {
    p_decision_id: input.decisionId,
    p_expected_revision: input.revision,
    p_criterion_id: input.criterionId,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId,
  });
  if (error || data !== true) throw mapError(error);
}

export async function approveSubmission(client: SupabaseClient, input: {
  taskRunId: string; revision: number; decisionId: string | null; reason: string | null; actorUserId: string | null;
}) {
  const { data, error } = await client.rpc("approve_submission", {
    p_task_run_id: input.taskRunId,
    p_expected_revision: input.revision,
    p_decision_id: input.decisionId,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId,
  });
  if (error || data !== true) throw mapError(error);
}
