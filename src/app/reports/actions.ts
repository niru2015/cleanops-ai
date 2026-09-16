"use server";

import { revalidatePath } from "next/cache";
import { prepareDemoReport, releaseDemoReport } from "@/integrations/reporting/supabase-reporting";
import { reportActionSchema, type ReportActionInput } from "@/schemas/reporting";
import { getReportingRuntime } from "@/services/reporting-runtime";

export type ReportActionState = { ok: boolean; message: string };

export async function performReportAction(input: ReportActionInput): Promise<ReportActionState> {
  const parsed = reportActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The report request was invalid." };
  try {
    const runtime = await getReportingRuntime();
    if (parsed.data.action === "prepare_report") await prepareDemoReport(runtime.accessClient, runtime.actorUserId);
    else await releaseDemoReport(runtime.accessClient, parsed.data.reportId, runtime.actorUserId);
    revalidatePath("/reports");
    revalidatePath("/reports/client");
    return parsed.data.action === "prepare_report"
      ? { ok: true, message: "Shift report prepared from versioned task results. It remains private until release." }
      : { ok: true, message: "Supervisor released the redacted report to authorized client viewers." };
  } catch {
    revalidatePath("/reports");
    return { ok: false, message: "The report action could not be completed. Confirm the incident records and access scope." };
  }
}
