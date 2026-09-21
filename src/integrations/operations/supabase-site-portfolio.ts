import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AccessSite } from "@/services/access-context";

const uuid = z.string().uuid();
const zoneSchema = z.object({ id: uuid, site_id: uuid, name: z.string() });
const taskSchema = z.object({ id: uuid, site_id: uuid, name: z.string(), active: z.boolean() });
const runSchema = z.object({ id: uuid, site_id: uuid, state: z.string() });
const permissionSchema = z.object({ id: uuid, site_id: uuid, state: z.string() });
const equipmentSchema = z.object({
  id: uuid,
  site_id: uuid,
  asset_code: z.string(),
  status: z.string(),
  condition: z.string(),
  last_service_date: z.string().nullable(),
  next_service_date: z.string().nullable(),
  equipment_models: z.object({ manufacturer: z.string(), model_name: z.string(), category: z.string() }).nullable(),
});
const reportSchema = z.object({ id: uuid, site_id: uuid, equipment_label: z.string(), state: z.string() });

async function rows<T>(promise: PromiseLike<{ data: unknown; error: { message?: string } | null }>, schema: z.ZodType<T>) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Site portfolio data is unavailable.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Site portfolio data did not match its contract.");
  return parsed.data;
}

export type SitePortfolio = {
  sites: Array<AccessSite & {
    zones: { id: string; name: string }[];
    activeTasks: number;
    taskRuns: number;
    workers: number;
    equipment: Array<{ id: string; assetTag: string; type: string; manufacturer: string | null; model: string | null; state: string; condition: string; lastServiceAt: string | null; nextServiceAt: string | null }>;
    equipmentReports: Array<{ id: string; label: string; state: string }>;
  }>;
};

export async function getSitePortfolio(client: SupabaseClient, sites: AccessSite[]): Promise<SitePortfolio> {
  const siteIds = sites.map((site) => site.id);
  if (!siteIds.length) return { sites: [] };

  const [zones, tasks, runs, permissions, equipment, reports] = await Promise.all([
    rows(client.from("site_zones").select("id,site_id,name").in("site_id", siteIds).order("name"), z.array(zoneSchema)),
    rows(client.from("service_tasks").select("id,site_id,name,active").in("site_id", siteIds), z.array(taskSchema)),
    rows(client.from("task_runs").select("id,site_id,state").in("site_id", siteIds), z.array(runSchema)),
    rows(client.from("worker_site_permissions").select("id,site_id,state").in("site_id", siteIds).eq("state", "active"), z.array(permissionSchema)),
    rows(client.from("equipment_assets").select("id,site_id,asset_code,status,condition,last_service_date,next_service_date,equipment_models(manufacturer,model_name,category)").in("site_id", siteIds).order("asset_code"), z.array(equipmentSchema)),
    rows(client.from("equipment_reports").select("id,site_id,equipment_label,state").in("site_id", siteIds).order("reported_at", { ascending: false }), z.array(reportSchema)),
  ]);
  return {
    sites: sites.map((site) => ({
      ...site,
      zones: zones.filter((zone) => zone.site_id === site.id).map(({ id, name }) => ({ id, name })),
      activeTasks: tasks.filter((task) => task.site_id === site.id && task.active).length,
      taskRuns: runs.filter((run) => run.site_id === site.id).length,
      workers: permissions.filter((permission) => permission.site_id === site.id).length,
      equipment: equipment.filter((asset) => asset.site_id === site.id).map((asset) => ({
        id: asset.id,
        assetTag: asset.asset_code,
        type: asset.equipment_models?.category ?? "Equipment asset",
        manufacturer: asset.equipment_models?.manufacturer ?? null,
        model: asset.equipment_models?.model_name ?? null,
        state: asset.status,
        condition: asset.condition,
        lastServiceAt: asset.last_service_date,
        nextServiceAt: asset.next_service_date,
      })),
      equipmentReports: reports.filter((report) => report.site_id === site.id).map((report) => ({ id: report.id, label: report.equipment_label, state: report.state })),
    })),
  };
}
