"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";

const uuid = z.uuid();
const action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), siteId: uuid, code: z.string().trim().min(2).max(40),
    name: z.string().trim().min(2).max(160), scope: z.string().trim().min(4).max(2000), contractId: uuid.nullish() }),
  z.object({ kind: z.literal("scope"), projectId: uuid, name: z.string().trim().min(2).max(160),
    scope: z.string().trim().min(4).max(2000), contractId: uuid.nullish() }),
  z.object({ kind: z.literal("approve"), projectId: uuid, model: z.enum(["fixed", "hourly"]),
    amount: z.number().nonnegative().max(1_000_000_000) }),
  z.object({ kind: z.literal("complete"), projectId: uuid, complete: z.boolean() }),
  z.object({ kind: z.literal("cancel"), projectId: uuid }),
  z.object({ kind: z.literal("link"), projectId: uuid, sourceType: z.enum(["expense", "inventory_issue", "accounting", "time"]), sourceId: uuid }),
  z.object({ kind: z.literal("billable"), projectId: uuid, timeEntryId: uuid, hours: z.number().positive().max(24) }),
  z.object({ kind: z.literal("invoice"), projectId: uuid, reference: z.string().trim().min(2).max(160),
    date: z.iso.date(), amount: z.number().positive().max(1_000_000_000) }),
]);

export async function performProjectAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const value = action.parse(input);
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canViewFinance) throw new Error("Finance access required.");
    if (value.kind === "create" && !isSiteAllowed(access, value.siteId)) throw new Error("Site access required.");
    if (value.kind !== "create" && value.kind !== "scope" && value.kind !== "link" && !access.canEditFinance) throw new Error("Director approval required.");
    if (value.kind === "link" && value.sourceType !== "time" && !access.canEditFinance) throw new Error("Director source approval required.");
    let result;
    if (value.kind === "create") result = await client.rpc("create_finance_project", {
      p_site_id: value.siteId, p_project_code: value.code, p_name: value.name, p_scope: value.scope,
      p_contract_id: value.contractId ?? null });
    else if (value.kind === "scope") result = await client.rpc("update_finance_project_scope", {
      p_project_id: value.projectId, p_name: value.name, p_scope: value.scope,
      p_contract_id: value.contractId ?? null });
    else if (value.kind === "approve") result = await client.rpc("approve_finance_project", {
      p_project_id: value.projectId, p_pricing_model: value.model,
      p_fixed_quote: value.model === "fixed" ? value.amount : null,
      p_hourly_rate: value.model === "hourly" ? value.amount : null });
    else if (value.kind === "complete") result = await client.rpc("set_finance_project_completion", {
      p_project_id: value.projectId, p_complete: value.complete });
    else if (value.kind === "cancel") result = await client.rpc("cancel_finance_project", { p_project_id: value.projectId });
    else if (value.kind === "billable") result = await client.rpc("approve_finance_project_billable_time", {
      p_project_id: value.projectId, p_time_entry_id: value.timeEntryId, p_hours: value.hours });
    else if (value.kind === "invoice") result = await client.rpc("record_finance_project_invoice", {
      p_project_id: value.projectId, p_reference: value.reference, p_date: value.date, p_amount: value.amount });
    else if (value.sourceType === "time") result = await client.rpc("assign_finance_project_time", {
      p_project_id: value.projectId, p_time_entry_id: value.sourceId });
    else result = await client.rpc("assign_finance_project_source", {
      p_project_id: value.projectId, p_source_type: value.sourceType, p_source_id: value.sourceId });
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/finance/projects"); revalidatePath("/finance");
    return { ok: true, message: "Project saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Project action failed." };
  }
}
