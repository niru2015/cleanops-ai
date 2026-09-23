import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { FinanceSiteContext } from "@/services/finance-context";
import { optionalFinanceRows } from "@/services/finance-schema-availability";

const uuid = z.string().uuid();
const row = async <T>(promise: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>, schema: z.ZodType<T>) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Financial records are unavailable.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Financial records did not match their contract.");
  return parsed.data;
};

const vendorSchema = z.object({ id: uuid, name: z.string(), vendor_code: z.string().nullable(), active: z.boolean() });
const itemSchema = z.object({ id: uuid, name: z.string(), sku: z.string().nullable(), unit_of_measure: z.string(), reorder_level: z.number(), active: z.boolean() });
const workerSchema = z.object({ id: uuid, display_name: z.string() });
const taskSchema = z.object({ id: uuid, task_id: uuid, state: z.string() });
const serviceTaskSchema = z.object({ id: uuid, name: z.string() });
const inventoryRowSchema = z.object({ id: uuid, transaction_type: z.string(), quantity: z.number(), unit_cost: z.number(), total_cost: z.number(), occurred_at: z.string(), notes: z.string().nullable(), vendor_id: uuid.nullable(), inventory_item_id: uuid });
const labourRowSchema = z.object({ id: uuid, work_date: z.string(), hours: z.number(), hourly_cost: z.number(), total_cost: z.number(), cost_type: z.string(), notes: z.string().nullable(), worker_id: uuid.nullable(), task_run_id: uuid.nullable() });
const postedTimeSchema = z.object({ id: uuid, labor_cost_entry_id: uuid.nullable() });
const reconciliationSchema = z.object({ service_period: z.string(), currency: z.string(), recognized_revenue: z.number(), direct_labour: z.number(), supplies: z.number(), repairs: z.number(), other_direct_cost: z.number(), direct_contribution: z.number(), completeness: z.string(), reconciled_at: z.string() });
const importBatchSchema = z.object({ id: uuid, source_file_name: z.string(), state: z.string(), completeness: z.string(), accepted_at: z.string().nullable(), created_at: z.string() });

export type FinanceWorkspace = {
  vendors: { id: string; name: string; code: string | null }[];
  items: { id: string; name: string; sku: string | null; unit: string; reorderLevel: number }[];
  workers: { id: string; name: string }[];
  tasks: { id: string; name: string; state: string }[];
  inventory: { id: string; type: string; item: string; itemId: string; unit: string; vendor: string | null; vendorId: string | null; quantity: number; unitCost: number; totalCost: number; occurredAt: string; notes: string | null }[];
  labour: { id: string; workDate: string; worker: string | null; workerId: string | null; taskRunId: string | null; timeEntryId: string | null; hours: number; hourlyCost: number; totalCost: number; type: string; notes: string | null }[];
  /** True when the labour ledger was not queried because the caller cannot read it (RLS restricts
   * `labor_cost_entries` to Directors). Distinguishes "restricted" from "genuinely empty" — an
   * empty `labour` array alone is ambiguous between the two. */
  labourRestricted: boolean;
  reconciliations: { period: string; currency: string; revenue: number; labour: number; supplies: number; repairs: number; otherDirectCost: number; contribution: number; completeness: string; reconciledAt: string }[];
  imports: { id: string; fileName: string; state: string; completeness: string; acceptedAt: string | null; createdAt: string }[];
  accountingAvailable: boolean;
  timeAvailable: boolean;
};

export async function getFinanceWorkspace(client: SupabaseClient, context: FinanceSiteContext): Promise<FinanceWorkspace> {
  const [vendors, items, workers, tasks, serviceTasks, inventory, labour, reconciliations, imports] = await Promise.all([
    row(client.from("vendors").select("id,name,vendor_code,active").eq("organization_id", context.organizationId).order("name"), z.array(vendorSchema)),
    row(client.from("inventory_items").select("id,name,sku,unit_of_measure,reorder_level,active").eq("organization_id", context.organizationId).order("name"), z.array(itemSchema)),
    row(client.from("workers").select("id,display_name").eq("organization_id", context.organizationId).order("display_name"), z.array(workerSchema)),
    row(client.from("task_runs").select("id,task_id,state").eq("organization_id", context.organizationId).eq("site_id", context.siteId).order("due_at"), z.array(taskSchema)),
    row(client.from("service_tasks").select("id,name").eq("organization_id", context.organizationId).eq("site_id", context.siteId), z.array(serviceTaskSchema)),
    row(client.from("inventory_transactions").select("id,transaction_type,quantity,unit_cost,total_cost,occurred_at,notes,vendor_id,inventory_item_id").eq("organization_id", context.organizationId).eq("site_id", context.siteId).order("occurred_at", { ascending: false }).limit(12), z.array(inventoryRowSchema)),
    // labor_cost_entries is RLS-restricted to Directors (can_administer_org). A non-Director's query
    // would just return zero rows rather than erroring, which is indistinguishable from a genuinely
    // empty ledger — skip the query entirely and let labourRestricted below carry the real reason.
    context.canReadLabour
      ? row(client.from("labor_cost_entries").select("id,work_date,hours,hourly_cost,total_cost,cost_type,notes,worker_id,task_run_id").eq("organization_id", context.organizationId).eq("site_id", context.siteId).order("work_date", { ascending: false }).limit(12), z.array(labourRowSchema))
      : Promise.resolve([] as z.infer<typeof labourRowSchema>[]),
    optionalFinanceRows(client.from("finance_reconciliations").select("service_period,currency,recognized_revenue,direct_labour,supplies,repairs,other_direct_cost,direct_contribution,completeness,reconciled_at").eq("organization_id", context.organizationId).eq("site_id", context.siteId).eq("is_current", true).order("service_period", { ascending: false }).limit(12), z.array(reconciliationSchema)),
    optionalFinanceRows(client.from("finance_import_batches").select("id,source_file_name,state,completeness,accepted_at,created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(8), z.array(importBatchSchema)),
  ]);
  const postedTime = await optionalFinanceRows(
    (context.canReadLabour && labour.length
      ? client.from("time_entries").select("id,labor_cost_entry_id").eq("organization_id", context.organizationId)
        .eq("site_id", context.siteId).in("labor_cost_entry_id", labour.map(entry => entry.id))
      : client.from("time_entries").select("id,labor_cost_entry_id").eq("organization_id", context.organizationId)
        .eq("site_id", context.siteId).limit(0)), z.array(postedTimeSchema));
  const timeByLedger = new Map(postedTime.rows.filter(entry => entry.labor_cost_entry_id)
    .map(entry => [entry.labor_cost_entry_id, entry.id]));

  return {
    vendors: vendors.filter((entry) => entry.active).map((entry) => ({ id: entry.id, name: entry.name, code: entry.vendor_code })),
    items: items.filter((entry) => entry.active).map((entry) => ({ id: entry.id, name: entry.name, sku: entry.sku, unit: entry.unit_of_measure, reorderLevel: entry.reorder_level })),
    workers: workers.map((entry) => ({ id: entry.id, name: entry.display_name })),
    tasks: tasks.map((entry) => ({ id: entry.id, name: serviceTasks.find((task) => task.id === entry.task_id)?.name ?? "Service task", state: entry.state })),
    inventory: inventory.map((entry) => ({ id: entry.id, type: entry.transaction_type, item: items.find((item) => item.id === entry.inventory_item_id)?.name ?? "Inventory item", itemId: entry.inventory_item_id, unit: items.find((item) => item.id === entry.inventory_item_id)?.unit_of_measure ?? "unit", vendor: vendors.find((vendor) => vendor.id === entry.vendor_id)?.name ?? null, vendorId: entry.vendor_id, quantity: entry.quantity, unitCost: entry.unit_cost, totalCost: entry.total_cost, occurredAt: entry.occurred_at, notes: entry.notes })),
    labour: labour.map((entry) => ({ id: entry.id, workDate: entry.work_date, worker: workers.find((worker) => worker.id === entry.worker_id)?.display_name ?? null, workerId: entry.worker_id, taskRunId: entry.task_run_id, timeEntryId: timeByLedger.get(entry.id) ?? null, hours: entry.hours, hourlyCost: entry.hourly_cost, totalCost: entry.total_cost, type: entry.cost_type, notes: entry.notes })),
    labourRestricted: !context.canReadLabour,
    reconciliations: reconciliations.rows.map((entry) => ({ period: entry.service_period, currency: entry.currency, revenue: entry.recognized_revenue, labour: entry.direct_labour, supplies: entry.supplies, repairs: entry.repairs, otherDirectCost: entry.other_direct_cost, contribution: entry.direct_contribution, completeness: entry.completeness, reconciledAt: entry.reconciled_at })),
    imports: imports.rows.map((entry) => ({ id: entry.id, fileName: entry.source_file_name, state: entry.state, completeness: entry.completeness, acceptedAt: entry.accepted_at, createdAt: entry.created_at })),
    accountingAvailable: reconciliations.available && imports.available,
    timeAvailable: postedTime.available,
  };
}
