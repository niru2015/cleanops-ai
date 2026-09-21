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
const inventoryRowSchema = z.object({ id: uuid, transaction_type: z.string(), quantity: z.number(), unit_cost: z.number(), total_cost: z.number(), occurred_at: z.string(), notes: z.string().nullable(), inventory_items: z.object({ name: z.string(), unit_of_measure: z.string() }).nullable(), vendors: z.object({ name: z.string() }).nullable() });
const labourRowSchema = z.object({ id: uuid, work_date: z.string(), hours: z.number(), hourly_cost: z.number(), total_cost: z.number(), cost_type: z.string(), notes: z.string().nullable(), workers: z.object({ display_name: z.string() }).nullable() });

export type FinanceWorkspace = {
  vendors: { id: string; name: string; code: string | null }[];
  items: { id: string; name: string; sku: string | null; unit: string; reorderLevel: number }[];
  workers: { id: string; name: string }[];
  tasks: { id: string; name: string; state: string }[];
  inventory: { id: string; type: string; item: string; unit: string; vendor: string | null; quantity: number; unitCost: number; totalCost: number; occurredAt: string; notes: string | null }[];
  labour: { id: string; workDate: string; worker: string | null; hours: number; hourlyCost: number; totalCost: number; type: string; notes: string | null }[];
};

export async function getFinanceWorkspace(client: SupabaseClient, siteId: string): Promise<FinanceWorkspace> {
  const [vendors, items, workers, tasks, inventory, labour] = await Promise.all([
    row(client.from("vendors").select("id,name,vendor_code").eq("organization_id", DEMO_ORGANIZATION_ID).eq("active", true).order("name"), z.array(vendorSchema)),
    row(client.from("inventory_items").select("id,name,sku,unit_of_measure,reorder_level").eq("organization_id", DEMO_ORGANIZATION_ID).eq("active", true).order("name"), z.array(itemSchema)),
    row(client.from("workers").select("id,display_name").eq("organization_id", DEMO_ORGANIZATION_ID).order("display_name"), z.array(workerSchema)),
    row(client.from("task_runs").select("id,state,service_tasks(name)").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("due_at"), z.array(taskSchema)),
    row(client.from("inventory_transactions").select("id,transaction_type,quantity,unit_cost,total_cost,occurred_at,notes,inventory_items(name,unit_of_measure),vendors(name)").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("occurred_at", { ascending: false }).limit(12), z.array(inventoryRowSchema)),
    row(client.from("labor_cost_entries").select("id,work_date,hours,hourly_cost,total_cost,cost_type,notes,workers(display_name)").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("work_date", { ascending: false }).limit(12), z.array(labourRowSchema)),
  ]);

  return {
    vendors: vendors.map((entry) => ({ id: entry.id, name: entry.name, code: entry.vendor_code })),
    items: items.map((entry) => ({ id: entry.id, name: entry.name, sku: entry.sku, unit: entry.unit_of_measure, reorderLevel: entry.reorder_level })),
    workers: workers.map((entry) => ({ id: entry.id, name: entry.display_name })),
    tasks: tasks.map((entry) => ({ id: entry.id, name: entry.service_tasks?.name ?? "Service task", state: entry.state })),
    inventory: inventory.map((entry) => ({ id: entry.id, type: entry.transaction_type, item: entry.inventory_items?.name ?? "Inventory item", unit: entry.inventory_items?.unit_of_measure ?? "unit", vendor: entry.vendors?.name ?? null, quantity: entry.quantity, unitCost: entry.unit_cost, totalCost: entry.total_cost, occurredAt: entry.occurred_at, notes: entry.notes })),
    labour: labour.map((entry) => ({ id: entry.id, workDate: entry.work_date, worker: entry.workers?.display_name ?? null, hours: entry.hours, hourlyCost: entry.hourly_cost, totalCost: entry.total_cost, type: entry.cost_type, notes: entry.notes })),
  };
}
