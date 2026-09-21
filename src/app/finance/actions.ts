"use server";

import { revalidatePath } from "next/cache";
import { financeActionSchema, messageResolutionSchema, type FinanceActionInput, type MessageResolutionInput } from "@/schemas/finance";
import { resolveMessageContext } from "@/integrations/messages/supabase-message-context";
import { DEMO_ORGANIZATION_ID, DEMO_SITE_ID, getOperationsRuntime } from "@/services/operations-runtime";

export type FinanceActionState = { ok: boolean; message: string };

function success(message: string) { return { ok: true, message } satisfies FinanceActionState; }
function failure(message: string) { return { ok: false, message } satisfies FinanceActionState; }

export async function performFinanceAction(input: FinanceActionInput): Promise<FinanceActionState> {
  const parsed = financeActionSchema.safeParse(input);
  if (!parsed.success) return failure("The finance request was invalid.");
  try {
    const runtime = await getOperationsRuntime("supervisor");
    const client = runtime.demo ? runtime.writeClient : runtime.accessClient;
    if (parsed.data.action === "create_vendor") {
      const { error } = await client.from("vendors").insert({ organization_id: DEMO_ORGANIZATION_ID, name: parsed.data.name, vendor_code: parsed.data.vendorCode ?? null, contact_reference: parsed.data.contactReference ?? null });
      if (error) throw error;
      revalidatePath("/finance");
      return success("Vendor added to the organization catalogue.");
    }
    if (parsed.data.action === "create_inventory_item") {
      const { error } = await client.from("inventory_items").insert({ organization_id: DEMO_ORGANIZATION_ID, sku: parsed.data.sku ?? null, name: parsed.data.name, category: parsed.data.category ?? null, unit_of_measure: parsed.data.unitOfMeasure, reorder_level: parsed.data.reorderLevel });
      if (error) throw error;
      revalidatePath("/finance");
      return success("Inventory item added to the organization catalogue.");
    }
    if (parsed.data.action === "record_inventory") {
      const { error } = await client.from("inventory_transactions").insert({ organization_id: DEMO_ORGANIZATION_ID, site_id: DEMO_SITE_ID, vendor_id: parsed.data.vendorId ?? null, inventory_item_id: parsed.data.inventoryItemId, transaction_type: parsed.data.transactionType, quantity: parsed.data.quantity, unit_cost: parsed.data.unitCost, occurred_at: parsed.data.occurredAt, notes: parsed.data.notes ?? null });
      if (error) throw error;
      revalidatePath("/finance");
      return success("Inventory transaction recorded. Its total cost is calculated by the database.");
    }
    const { error } = await client.from("labor_cost_entries").insert({ organization_id: DEMO_ORGANIZATION_ID, site_id: DEMO_SITE_ID, worker_id: parsed.data.workerId ?? null, task_run_id: parsed.data.taskRunId ?? null, work_date: parsed.data.workDate, hours: parsed.data.hours, hourly_cost: parsed.data.hourlyCost, cost_type: parsed.data.costType, notes: parsed.data.notes ?? null });
    if (error) throw error;
    revalidatePath("/finance");
    return success("Labour cost recorded. Hours and cost rate determine the saved total.");
  } catch {
    revalidatePath("/finance");
    return failure("The record could not be saved. Review the site access and values, then try again.");
  }
}

export async function performMessageResolution(input: MessageResolutionInput): Promise<FinanceActionState> {
  const parsed = messageResolutionSchema.safeParse(input);
  if (!parsed.success) return failure("The message categorization request was invalid.");
  try {
    const runtime = await getOperationsRuntime("supervisor");
    await resolveMessageContext(runtime.demo ? runtime.writeClient : runtime.accessClient, parsed.data);
    revalidatePath("/finance");
    return success("Message context confirmed by a supervisor. It can now support reporting and finance attribution.");
  } catch {
    revalidatePath("/finance");
    return failure("The message context could not be updated. Review the selected site access and try again.");
  }
}
