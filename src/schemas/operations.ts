import { z } from "zod";

export const operationsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select_replacement"), workerId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("check_in_replacement"), workerId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("reset_hosted_demo") }).strict(),
]);

export const mobileActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select_zone"), taskRunId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("capture"), taskRunId: z.string().uuid(), role: z.enum(["before", "after"]), simulateFailure: z.boolean().default(false) }).strict(),
]);

export type OperationsActionInput = z.infer<typeof operationsActionSchema>;
export type MobileActionInput = z.infer<typeof mobileActionSchema>;
