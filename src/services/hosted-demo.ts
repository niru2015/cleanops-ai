import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const HOSTED_DEMO_ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
export const HOSTED_DEMO_SITE_ID = "40000000-0000-4000-8000-000000000001";
const HOSTED_CAPTURE_WORKER_ID = "60000000-0000-4000-8000-000000000001";

const configSchema = z.object({
  CLEANOPS_HOSTED_DEMO_ENABLED: z.enum(["true", "false"]).default("false"),
});

const membershipSchema = z.object({
  id: z.uuid(),
  role: z.enum([
    "cleaner",
    "site_supervisor",
    "area_manager",
    "operations_manager",
    "organization_administrator",
    "client_viewer",
  ]),
});

const idSchema = z.object({ id: z.uuid() });

export type HostedDemoCapability = "supervisor" | "cleaner" | "capture" | "client";

const allowedRoles: Record<HostedDemoCapability, Set<string>> = {
  supervisor: new Set(["site_supervisor", "area_manager", "operations_manager", "organization_administrator"]),
  cleaner: new Set(["cleaner", "organization_administrator"]),
  capture: new Set(["cleaner", "site_supervisor", "area_manager", "operations_manager", "organization_administrator"]),
  client: new Set(["client_viewer"]),
};

export function isHostedDemoEnabled(environment: Record<string, string | undefined> = process.env) {
  const parsed = configSchema.safeParse(environment);
  return parsed.success && parsed.data.CLEANOPS_HOSTED_DEMO_ENABLED === "true";
}

export async function hasHostedDemoAccess(
  client: SupabaseClient,
  userId: string,
  capability: HostedDemoCapability,
) {
  if (!isHostedDemoEnabled()) return false;

  const membershipResult = await client
    .from("memberships")
    .select("id,role")
    .eq("organization_id", HOSTED_DEMO_ORGANIZATION_ID)
    .eq("user_id", userId)
    .eq("state", "active")
    .maybeSingle();
  if (membershipResult.error || !membershipResult.data) return false;

  const membership = membershipSchema.safeParse(membershipResult.data);
  if (!membership.success || !allowedRoles[capability].has(membership.data.role)) return false;

  const role = membership.data.role;
  const organizationWide =
    role === "organization_administrator" || role === "operations_manager";

  if (!organizationWide) {
    const now = new Date().toISOString();
    const accessResult = await client
      .from("member_site_access")
      .select("id")
      .eq("membership_id", membership.data.id)
      .eq("site_id", HOSTED_DEMO_SITE_ID)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .limit(1)
      .maybeSingle();
    if (accessResult.error || !idSchema.safeParse(accessResult.data).success) return false;
  }

  if ((capability !== "cleaner" && capability !== "capture") || role !== "cleaner") return true;

  const workerResult = await client
    .from("workers")
    .select("id")
    .eq("organization_id", HOSTED_DEMO_ORGANIZATION_ID)
    .eq("auth_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  const worker = idSchema.safeParse(workerResult.data);
  return !workerResult.error && worker.success
    && (capability !== "capture" || worker.data.id === HOSTED_CAPTURE_WORKER_ID);
}
