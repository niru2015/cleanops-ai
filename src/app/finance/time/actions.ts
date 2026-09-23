"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";

const uuid = z.uuid();
const costType = z.enum(["regular", "overtime", "contractor"]);
const date = z.iso.date();
const reason = z.string().trim().min(4).max(500);
const action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("derive"), siteId: uuid, assignmentId: uuid }),
  z.object({ kind: z.literal("manual"), siteId: uuid, workerId: uuid, workDate: date,
    hours: z.number().positive().max(24), costType, projectReference: z.string().trim().min(2).max(180),
    contractVersionId: uuid.nullish(), taskRunId: uuid.nullish(), reason }),
  z.object({ kind: z.literal("review"), siteId: uuid, entryId: uuid, decision: z.enum(["approve", "reject"]),
    hours: z.number().positive().max(24).nullish(), costType: costType.nullish(), reason }),
  z.object({ kind: z.literal("post"), siteId: uuid, entryId: uuid }),
]);

export async function performTimeAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const value = action.parse(input);
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canManageOperations || !isSiteAllowed(access, value.siteId)) throw new Error("Site time access required.");
    if (value.kind === "post" && !access.canEditFinance) throw new Error("Director cost posting required.");
    if (value.kind === "derive") {
      const assignment = await client.from("shift_assignments").select("id")
        .eq("id", value.assignmentId).eq("organization_id", access.organizationId)
        .eq("site_id", value.siteId).maybeSingle();
      if (assignment.error || !assignment.data) throw new Error("Shift assignment is unavailable for this casino.");
    }
    if (value.kind === "review" || value.kind === "post") {
      const visible = await client.from("time_entries").select("id").eq("id", value.entryId)
        .eq("organization_id", access.organizationId).eq("site_id", value.siteId).maybeSingle();
      if (visible.error || !visible.data) throw new Error("Time entry is unavailable for this casino.");
    }
    let result;
    if (value.kind === "derive") result = await client.rpc("derive_shift_time_entry", { p_assignment_id: value.assignmentId });
    else if (value.kind === "manual") result = await client.rpc("create_manual_time_entry", {
      p_site_id: value.siteId, p_worker_id: value.workerId, p_work_date: value.workDate,
      p_hours: value.hours, p_cost_type: value.costType, p_project_reference: value.projectReference,
      p_contract_version_id: value.contractVersionId ?? null, p_task_run_id: value.taskRunId ?? null,
      p_reason: value.reason,
    });
    else if (value.kind === "review") result = await client.rpc("review_time_entry", {
      p_time_entry_id: value.entryId, p_action: value.decision, p_hours: value.hours ?? null,
      p_cost_type: value.costType ?? null, p_reason: value.reason,
    });
    else result = await client.rpc("post_approved_time_cost", { p_time_entry_id: value.entryId });
    if (result.error) throw new Error(result.error.message);
    if (value.kind === "derive" && result.data === null) return { ok: false, message: "No attendance events are recorded for that assignment." };
    revalidatePath("/finance/time"); revalidatePath("/finance");
    return { ok: true, message: value.kind === "post" ? "Approved time posted once using the effective worker rate." : "Time record saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Time action failed." };
  }
}
