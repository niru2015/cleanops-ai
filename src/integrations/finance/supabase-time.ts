import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AppAccessContext } from "@/services/access-context";

const uuid = z.uuid();
const timeRow = z.object({ id: uuid, site_id: uuid, worker_id: uuid, assignment_id: uuid.nullable(),
  work_date: z.string(), hours: z.number().nullable(), cost_type: z.string(), state: z.string(),
  exception_code: z.string().nullable(), source_type: z.string(), project_reference: z.string().nullable(),
  review_reason: z.string().nullable(), labor_cost_entry_id: uuid.nullable(), revision: z.number() });
const assignmentRow = z.object({ id: uuid, site_id: uuid, worker_id: uuid, shift_id: uuid, state: z.string() });
const workerRow = z.object({ id: uuid, display_name: z.string() });
const permissionRow = z.object({ worker_id: uuid, site_id: uuid, state: z.string() });
const siteRow = z.object({ id: uuid, name: z.string() });
const rateRow = z.object({ id: uuid, worker_id: uuid, rate_type: z.string(), hourly_cost: z.number(),
  currency: z.string(), effective_from: z.string(), effective_to: z.string().nullable(),
  state: z.string(), reference: z.string().nullable(), reason: z.string() });
const timeEventRow = z.object({ id: uuid, time_entry_id: uuid, action: z.string(),
  reason: z.string().nullable(), actor_id: uuid.nullable(), created_at: z.string() });
const rateEventRow = z.object({ id: uuid, rate_id: uuid, action: z.string(),
  reason: z.string(), actor_id: uuid, created_at: z.string() });

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return schema.parse(result.data);
}

export async function getTimeWorkspace(client: SupabaseClient, access: AppAccessContext) {
  const sites = access.sites.map(site => site.id);
  if (!sites.length) return { entries: [], assignments: [], workers: [], sites: [], permissions: [], events: [] };
  const [entries, assignments, permissions, siteNames, events] = await Promise.all([
    rows(client.from("time_entries").select("id,site_id,worker_id,assignment_id,work_date,hours,cost_type,state,exception_code,source_type,project_reference,review_reason,labor_cost_entry_id,revision")
      .eq("organization_id", access.organizationId).in("site_id", sites).order("work_date", { ascending: false }).limit(100), z.array(timeRow)),
    rows(client.from("shift_assignments").select("id,site_id,worker_id,shift_id,state")
      .eq("organization_id", access.organizationId).in("site_id", sites).order("created_at", { ascending: false }).limit(100), z.array(assignmentRow)),
    rows(client.from("worker_site_permissions").select("worker_id,site_id,state")
      .eq("organization_id", access.organizationId).in("site_id", sites), z.array(permissionRow)),
    rows(client.from("sites").select("id,name").eq("organization_id", access.organizationId).in("id", sites), z.array(siteRow)),
    rows(client.from("time_entry_events").select("id,time_entry_id,action,reason,actor_id,created_at")
      .eq("organization_id", access.organizationId).in("site_id", sites).order("created_at", { ascending: false }).limit(300), z.array(timeEventRow)),
  ]);
  const workerIds = [...new Set(permissions.map(permission => permission.worker_id))];
  const workers = workerIds.length ? await rows(client.from("workers").select("id,display_name")
    .eq("organization_id", access.organizationId).in("id", workerIds).order("display_name"), z.array(workerRow)) : [];
  return { entries, assignments, workers, sites: siteNames, permissions, events };
}

export async function getRateWorkspace(client: SupabaseClient, access: AppAccessContext) {
  if (!access.canEditFinance) throw new Error("Director rate access required.");
  const [rates, workers, events] = await Promise.all([
    rows(client.from("worker_cost_rates").select("id,worker_id,rate_type,hourly_cost,currency,effective_from,effective_to,state,reference,reason")
      .eq("organization_id", access.organizationId).order("effective_from", { ascending: false }).limit(200), z.array(rateRow)),
    rows(client.from("workers").select("id,display_name").eq("organization_id", access.organizationId).order("display_name"), z.array(workerRow)),
    rows(client.from("worker_cost_rate_events").select("id,rate_id,action,reason,actor_id,created_at")
      .eq("organization_id", access.organizationId).order("created_at", { ascending: false }).limit(300), z.array(rateEventRow)),
  ]);
  return { rates, workers, events };
}
