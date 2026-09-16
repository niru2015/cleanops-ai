"use server";

import { revalidatePath } from "next/cache";
import { correctDemoIncident, recordDemoEquipmentReport, recordDemoIncident } from "@/integrations/reporting/supabase-reporting";
import { incidentActionSchema, type IncidentActionInput } from "@/schemas/reporting";
import { getReportingRuntime } from "@/services/reporting-runtime";

export type ReportingActionState = { ok: boolean; message: string };

export async function performIncidentAction(input: IncidentActionInput): Promise<ReportingActionState> {
  const parsed = incidentActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The reporting request was invalid." };
  try {
    const runtime = await getReportingRuntime();
    if (parsed.data.action === "record_incident") await recordDemoIncident(runtime.accessClient, runtime.actorUserId);
    if (parsed.data.action === "correct_incident") await correctDemoIncident(runtime.accessClient, parsed.data.incidentId, runtime.actorUserId);
    if (parsed.data.action === "record_equipment") await recordDemoEquipmentReport(runtime.accessClient, runtime.actorUserId);
    revalidatePath("/incidents");
    revalidatePath("/reports");
    if (parsed.data.action === "record_incident") return { ok: true, message: "Incident, attributed statement, action and timeline recorded without assigning cause." };
    if (parsed.data.action === "correct_incident") return { ok: true, message: "Incident wording corrected and added to the audit history." };
    return { ok: true, message: "Equipment issue recorded. No maintenance completion was created." };
  } catch {
    revalidatePath("/incidents");
    return { ok: false, message: "The record could not be saved. Review site access and try again." };
  }
}
