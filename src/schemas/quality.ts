import { z } from "zod";

const qualityFindingSchema = z
  .object({
    criterion_id: z.string().regex(/^[a-z0-9_.-]{1,80}$/),
    observation: z.string().trim().min(1).max(1000),
    severity: z.enum(["low", "medium", "high"]),
    evidence_ids: z.array(z.string().uuid()).min(1).max(2),
  })
  .strict();

export const qualityAssessmentSchema = z
  .object({
    task_run_id: z.string().uuid(),
    submission_revision: z.number().int().positive(),
    status: z.enum(["assessed", "insufficient_evidence"]),
    score: z.number().min(0).max(100).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    findings: z.array(qualityFindingSchema).max(20),
    limitations: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.status === "assessed" && result.score === null) {
      context.addIssue({ code: "custom", message: "Assessed results require a score.", path: ["score"] });
    }
    if (result.status === "insufficient_evidence" && result.score !== null) {
      context.addIssue({ code: "custom", message: "Insufficient results cannot have a score.", path: ["score"] });
    }
  });

export type QualityAssessment = z.infer<typeof qualityAssessmentSchema>;

export const reviewActionInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare_initial"), taskRunId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("submit_correction"), taskRunId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("run_mock"), taskRunId: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("simulate_failure"), taskRunId: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  z.object({
    action: z.literal("confirm"),
    decisionId: z.string().uuid(),
    revision: z.number().int().positive(),
    criterionId: z.string().regex(/^[a-z0-9_.-]{1,80}$/),
    instruction: z.string().trim().min(1).max(1000),
  }).strict(),
  z.object({
    action: z.literal("dismiss"),
    decisionId: z.string().uuid(),
    revision: z.number().int().positive(),
    criterionId: z.string().regex(/^[a-z0-9_.-]{1,80}$/),
    reason: z.string().trim().min(1).max(1000),
  }).strict(),
  z.object({
    action: z.literal("approve"),
    taskRunId: z.string().uuid(),
    revision: z.number().int().positive(),
    decisionId: z.string().uuid().nullable(),
    reason: z.string().trim().max(1000).nullable(),
  }).strict(),
]);

export type ReviewActionInput = z.infer<typeof reviewActionInputSchema>;
