"use server";

import { revalidatePath } from "next/cache";
import { financeActionSchema, messageResolutionSchema, type FinanceActionInput, type MessageResolutionInput } from "@/schemas/finance";
import { resolveMessageContext } from "@/integrations/messages/supabase-message-context";
import { DEMO_ORGANIZATION_ID, getOperationsRuntime } from "@/services/operations-runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";
import { createHash } from "node:crypto";
import { z } from "zod";
import { FINANCE_MAPPING_VERSION, parseFinanceCsv, type FinanceImportPreview } from "@/services/finance-csv";

export type FinanceActionState = { ok: boolean; message: string };
export type FinancePreviewState = FinanceActionState & { preview?: FinanceImportPreview };

const importInput = z.object({ fileName: z.string().min(1).max(255), csv: z.string().min(1).max(2_000_000) });
const acceptInput = importInput.extend({ completeness: z.enum(["complete", "incomplete", "estimated"]), supersedesBatchId: z.string().uuid().optional() });

function success(message: string) { return { ok: true, message } satisfies FinanceActionState; }
function failure(message: string) { return { ok: false, message } satisfies FinanceActionState; }

export async function previewFinanceImport(input: unknown): Promise<FinancePreviewState> {
  const parsed = importInput.safeParse(input);
  if (!parsed.success) return failure("Choose a CSV file under 2 MB.");
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canEditFinance) return failure("Director access is required to import financial records.");
    const preview = parseFinanceCsv(parsed.data.csv, access.sites);
    return { ok: preview.errors.length === 0, message: preview.errors.length ? "Resolve the preview errors before acceptance." : "Preview ready. Review the totals and exceptions before accepting.", preview };
  } catch (error) {
    return failure(error instanceof Error ? error.message : "The CSV could not be previewed.");
  }
}

export async function acceptFinanceImport(input: unknown): Promise<FinanceActionState> {
  const parsed = acceptInput.safeParse(input);
  if (!parsed.success) return failure("The finance import request was invalid.");
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canEditFinance) return failure("Director access is required to accept financial records.");
    const preview = parseFinanceCsv(parsed.data.csv, access.sites);
    if (preview.errors.length) return failure("Resolve the preview errors before acceptance.");
    if (parsed.data.completeness === "complete" && preview.warnings.length) return failure("A complete import cannot contain unallocated or unmapped rows.");
    const hash = createHash("sha256").update(parsed.data.csv).digest("hex");
    const staged = await client.rpc("stage_finance_csv_import", {
      p_organization_id: DEMO_ORGANIZATION_ID, p_source_file_name: parsed.data.fileName, p_source_file_hash: hash,
      p_mapping_version: FINANCE_MAPPING_VERSION, p_currency: preview.currency, p_period_start: preview.periodStart,
      p_period_end: preview.periodEnd, p_rows: preview.rows, p_supersedes_batch_id: parsed.data.supersedesBatchId ?? null,
    });
    if (staged.error || typeof staged.data !== "string") throw new Error(staged.error?.message ?? "The import could not be staged.");
    const accepted = await client.rpc("accept_finance_import", { p_batch_id: staged.data, p_completeness: parsed.data.completeness });
    if (accepted.error) throw new Error(accepted.error.message);
    revalidatePath("/finance");
    return success("Finance import accepted and reconciled. Re-importing the same file will not duplicate it.");
  } catch (error) {
    return failure(error instanceof Error ? error.message : "The finance import could not be accepted.");
  }
}

export async function performFinanceAction(input: FinanceActionInput): Promise<FinanceActionState> {
  const parsed = financeActionSchema.safeParse(input);
  if (!parsed.success) return failure("The finance request was invalid.");
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canEditFinance || !isSiteAllowed(access, parsed.data.siteId)) {
      return failure("Director access is required to change financial records.");
    }
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
      const { error } = await client.from("inventory_transactions").insert({ organization_id: DEMO_ORGANIZATION_ID, site_id: parsed.data.siteId, vendor_id: parsed.data.vendorId ?? null, inventory_item_id: parsed.data.inventoryItemId, transaction_type: parsed.data.transactionType, quantity: parsed.data.quantity, unit_cost: parsed.data.unitCost, occurred_at: parsed.data.occurredAt, notes: parsed.data.notes ?? null });
      if (error) throw error;
      revalidatePath("/finance");
      return success("Inventory transaction recorded. Its total cost is calculated by the database.");
    }
    const { error } = await client.from("labor_cost_entries").insert({ organization_id: DEMO_ORGANIZATION_ID, site_id: parsed.data.siteId, worker_id: parsed.data.workerId ?? null, task_run_id: parsed.data.taskRunId ?? null, work_date: parsed.data.workDate, hours: parsed.data.hours, hourly_cost: parsed.data.hourlyCost, cost_type: parsed.data.costType, notes: parsed.data.notes ?? null });
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
