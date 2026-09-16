import { z } from "zod";

const identifier = z.string().trim().min(1).max(255);

export const mockEvidenceRequestSchema = z
  .object({
    accountExternalId: z.string().trim().min(1).max(160),
    externalMessageId: identifier,
    mediaExternalId: identifier,
    declaredContentType: z.string().trim().min(1).max(120).nullable(),
    contentBase64: z.string().max(14_000_000).nullable(),
  })
  .strict();

export const evidenceReconcileRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();

export const evidenceResolutionRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("resolve"),
      workerId: z.string().uuid(),
      taskRunId: z.string().uuid(),
      role: z.enum(["before", "after"]),
      reasonCode: z.string().regex(/^[a-z0-9_.-]{1,64}$/),
      beforeEvidenceId: z.string().uuid().nullable().default(null),
    })
    .strict(),
  z
    .object({
      action: z.literal("ignore"),
      reasonCode: z.string().regex(/^[a-z0-9_.-]{1,64}$/),
    })
    .strict(),
]);

export type MockEvidenceRequest = z.infer<typeof mockEvidenceRequestSchema>;
export type EvidenceResolutionRequest = z.infer<typeof evidenceResolutionRequestSchema>;
