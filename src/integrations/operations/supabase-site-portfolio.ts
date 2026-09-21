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
  zone_id: uuid.nullable(),
  asset_tag: z.string(),
  equipment_type: z.string(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  state: z.string(),
  last_service_at: z.string().nullable(),
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
    equipment: Array<{ id: string; assetTag: string; type: string; manufacturer: string | null; model: string | null; state: string; zone: string | null; lastServiceAt: string | null }>;
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
    rows(client.from("equipment_assets").select("id,site_id,zone_id,asset_tag,equipment_type,manufacturer,model,state,last_service_at").in("site_id", siteIds).order("asset_tag"), z.array(equipmentSchema)),
    rows(client.from("equipment_reports").select("id,site_id,equipment_label,state").in("site_id", siteIds).order("reported_at", { ascending: false }), z.array(reportSchema)),
  ]);
  const zoneNames = new Map(zones.map((zone) => [zone.id, zone.name]));

  return {
    sites: sites.map((site) => ({
      ...site,
      zones: zones.filter((zone) => zone.site_id === site.id).map(({ id, name }) => ({ id, name })),
      activeTasks: tasks.filter((task) => task.site_id === site.id && task.active).length,
      taskRuns: runs.filter((run) => run.site_id === site.id).length,
      workers: permissions.filter((permission) => permission.site_id === site.id).length,
      equipment: equipment.filter((asset) => asset.site_id === site.id).map((asset) => ({
        id: asset.id,
        assetTag: asset.asset_tag,
        type: asset.equipment_type,
        manufacturer: asset.manufacturer,
        model: asset.model,
        state: asset.state,
        zone: asset.zone_id ? zoneNames.get(asset.zone_id) ?? null : null,
        lastServiceAt: asset.last_service_at,
      })),
      equipmentReports: reports.filter((report) => report.site_id === site.id).map((report) => ({ id: report.id, label: report.equipment_label, state: report.state })),
    })),
  };
}
