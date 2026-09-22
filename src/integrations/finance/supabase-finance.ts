import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEMO_ORGANIZATION_ID } from "@/services/operations-runtime";

const uuid = z.string().uuid();
const row = async <T>(promise: PromiseLike<{ data: unknown; error: { message?: string } | null }>, schema: z.ZodType<T>) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Financial records are unavailable.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Financial records did not match their contract.");
  return parsed.data;
};

const vendorSchema = z.object({ id: uuid, name: z.string(), vendor_code: z.string().nullable() });
const itemSchema = z.object({ id: uuid, name: z.string(), sku: z.string().nullable(), unit_of_measure: z.string(), reorder_level: z.number() });
const workerSchema = z.object({ id: uuid, display_name: z.string() });
const taskSchema = z.object({ id: uuid, state: z.string(), service_tasks: z.object({ name: z.string() }).nullable() });
const inventoryRowSchema = z.object({ id: uuid, transaction_type: z.string(), quantity: z.number(), unit_cost: z.number(), total_cost: z.number(), occurred_at: z.string(), notes: z.string().nullable(), vendor_id: uuid.nullable(), inventory_item_id: uuid, inventory_items: z.object({ name: z.string(), unit_of_measure: z.string() }).nullable(), vendors: z.object({ name: z.string() }).nullable() });
const labourRowSchema = z.object({ id: uuid, work_date: z.string(), hours: z.number(), hourly_cost: z.number(), total_cost: z.number(), cost_type: z.string(), notes: z.string().nullable(), worker_id: uuid.nullable(), task_run_id: uuid.nullable(), workers: z.object({ display_name: z.string() }).nullable() });
const reconciliationSchema = z.object({ service_period: z.string(), currency: z.string(), recognized_revenue: z.number(), direct_labour: z.number(), supplies: z.number(), repairs: z.number(), other_direct_cost: z.number(), direct_contribution: z.number(), completeness: z.string(), reconciled_at: z.string() });
const importBatchSchema = z.object({ id: uuid, source_file_name: z.string(), state: z.string(), completeness: z.string(), accepted_at: z.string().nullable(), created_at: z.string() });

export type FinanceWorkspace = {
  vendors: { id: string; name: string; code: string | null }[];
  items: { id: string; name: string; sku: string | null; unit: string; reorderLevel: number }[];
  workers: { id: string; name: string }[];
  tasks: { id: string; name: string; state: string }[];
  inventory: { id: string; type: string; item: string; itemId: string; unit: string; vendor: string | null; vendorId: string | null; quantity: number; unitCost: number; totalCost: number; occurredAt: string; notes: string | null }[];
  labour: { id: string; workDate: string; worker: string | null; workerId: string | null; taskRunId: string | null; hours: number; hourlyCost: number; totalCost: number; type: string; notes: string | null }[];
  /** True when the labour ledger was not queried because the caller cannot read it (RLS restricts
   * `labor_cost_entries` to Directors). Distinguishes "restricted" from "genuinely empty" — an
   * empty `labour` array alone is ambiguous between the two. */
  labourRestricted: boolean;
  reconciliations: { period: string; currency: string; revenue: number; labour: number; supplies: number; repairs: number; otherDirectCost: number; contribution: number; completeness: string; reconciledAt: string }[];
  imports: { id: string; fileName: string; state: string; completeness: string; acceptedAt: string | null; createdAt: string }[];
};

export async function getFinanceWorkspace(client: SupabaseClient, siteId: string, canReadLabour: boolean): Promise<FinanceWorkspace> {
  const [vendors, items, workers, tasks, inventory, labour, reconciliations, imports] = await Promise.all([
    row(client.from("vendors").select("id,name,vendor_code").eq("organization_id", DEMO_ORGANIZATION_ID).eq("active", true).order("name"), z.array(vendorSchema)),
    row(client.from("inventory_items").select("id,name,sku,unit_of_measure,reorder_level").eq("organization_id", DEMO_ORGANIZATION_ID).eq("active", true).order("name"), z.array(itemSchema)),
    row(client.from("workers").select("id,display_name").eq("organization_id", DEMO_ORGANIZATION_ID).order("display_name"), z.array(workerSchema)),
    row(client.from("task_runs").select("id,state,service_tasks(name)").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("due_at"), z.array(taskSchema)),
    row(client.from("inventory_transactions").select("id,transaction_type,quantity,unit_cost,total_cost,occurred_at,notes,vendor_id,inventory_item_id,inventory_items(name,unit_of_measure),vendors(name)").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("occurred_at", { ascending: false }).limit(12), z.array(inventoryRowSchema)),
    // labor_cost_entries is RLS-restricted to Directors (can_administer_org). A non-Director's query
    // would just return zero rows rather than erroring, which is indistinguishable from a genuinely
    // empty ledger — skip the query entirely and let labourRestricted below carry the real reason.
    canReadLabour
      ? row(client.from("labor_cost_entries").select("id,work_date,hours,hourly_cost,total_cost,cost_type,notes,worker_id,task_run_id,workers(display_name)").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("work_date", { ascending: false }).limit(12), z.array(labourRowSchema))
      : Promise.resolve([] as z.infer<typeof labourRowSchema>[]),
    row(client.from("finance_reconciliations").select("service_period,currency,recognized_revenue,direct_labour,supplies,repairs,other_direct_cost,direct_contribution,completeness,reconciled_at").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).eq("is_current", true).order("service_period", { ascending: false }).limit(12), z.array(reconciliationSchema)),
    row(client.from("finance_import_batches").select("id,source_file_name,state,completeness,accepted_at,created_at").eq("organization_id", DEMO_ORGANIZATION_ID).order("created_at", { ascending: false }).limit(8), z.array(importBatchSchema)),
  ]);

  return {
    vendors: vendors.map((entry) => ({ id: entry.id, name: entry.name, code: entry.vendor_code })),
    items: items.map((entry) => ({ id: entry.id, name: entry.name, sku: entry.sku, unit: entry.unit_of_measure, reorderLevel: entry.reorder_level })),
    workers: workers.map((entry) => ({ id: entry.id, name: entry.display_name })),
    tasks: tasks.map((entry) => ({ id: entry.id, name: entry.service_tasks?.name ?? "Service task", state: entry.state })),
    inventory: inventory.map((entry) => ({ id: entry.id, type: entry.transaction_type, item: entry.inventory_items?.name ?? "Inventory item", itemId: entry.inventory_item_id, unit: entry.inventory_items?.unit_of_measure ?? "unit", vendor: entry.vendors?.name ?? null, vendorId: entry.vendor_id, quantity: entry.quantity, unitCost: entry.unit_cost, totalCost: entry.total_cost, occurredAt: entry.occurred_at, notes: entry.notes })),
    labour: labour.map((entry) => ({ id: entry.id, workDate: entry.work_date, worker: entry.workers?.display_name ?? null, workerId: entry.worker_id, taskRunId: entry.task_run_id, hours: entry.hours, hourlyCost: entry.hourly_cost, totalCost: entry.total_cost, type: entry.cost_type, notes: entry.notes })),
    labourRestricted: !canReadLabour,
    reconciliations: reconciliations.map((entry) => ({ period: entry.service_period, currency: entry.currency, revenue: entry.recognized_revenue, labour: entry.direct_labour, supplies: entry.supplies, repairs: entry.repairs, otherDirectCost: entry.other_direct_cost, contribution: entry.direct_contribution, completeness: entry.completeness, reconciledAt: entry.reconciled_at })),
    imports: imports.map((entry) => ({ id: entry.id, fileName: entry.source_file_name, state: entry.state, completeness: entry.completeness, acceptedAt: entry.accepted_at, createdAt: entry.created_at })),
  };
}
