import { z } from "zod";

export const operationsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select_replacement"), workerId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("check_in_replacement"), workerId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("reset_hosted_demo") }).strict(),
]);

export const mobileActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select_zone"), taskRunId: z.string().uuid() }).strict(),
]);

export const mobilePhotoPrepareSchema = z.object({
  taskRunId: z.string().uuid(),
  role: z.enum(["before", "after"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().min(1).max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const mobilePhotoFinalizeSchema = z.object({
  evidenceId: z.string().uuid(),
  expiresAt: z.number().int().positive(),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type OperationsActionInput = z.infer<typeof operationsActionSchema>;
export type MobileActionInput = z.infer<typeof mobileActionSchema>;
export type MobilePhotoPrepareInput = z.infer<typeof mobilePhotoPrepareSchema>;
export type MobilePhotoFinalizeInput = z.infer<typeof mobilePhotoFinalizeSchema>;
