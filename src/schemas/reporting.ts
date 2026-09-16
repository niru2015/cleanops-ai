import { z } from "zod";

export const incidentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record_incident") }),
  z.object({ action: z.literal("correct_incident"), incidentId: z.string().uuid() }),
  z.object({ action: z.literal("record_equipment") }),
]);

export const reportActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare_report") }),
  z.object({ action: z.literal("release_report"), reportId: z.string().uuid() }),
]);

export type IncidentActionInput = z.infer<typeof incidentActionSchema>;
export type ReportActionInput = z.infer<typeof reportActionSchema>;
