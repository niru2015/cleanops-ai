import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HOSTED_DEMO_ORGANIZATION_ID } from "@/services/hosted-demo";

export type AppRole =
  | "cleaner"
  | "site_supervisor"
  | "area_manager"
  | "operations_manager"
  | "organization_administrator"
  | "client_viewer";

export type AccessSite = {
  id: string;
  name: string;
  city: string | null;
};

export type AppAccessContext = {
  userId: string;
  membershipId: string;
  role: AppRole;
  roleLabel: string;
  sites: AccessSite[];
  canManageOperations: boolean;
  canReviewEvidence: boolean;
  canViewFinance: boolean;
  canEditFinance: boolean;
  canViewIncidents: boolean;
  canViewReports: boolean;
  canUseCleanerMobile: boolean;
};

const membershipSchema = z.object({
  id: z.string().uuid(),
  role: z.enum([
    "cleaner",
    "site_supervisor",
    "area_manager",
    "operations_manager",
    "organization_administrator",
    "client_viewer",
  ]),
});

const accessRowSchema = z.object({
  site_id: z.string().uuid(),
});

const siteSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  city: z.string().nullable(),
});

const roleLabels: Record<AppRole, string> = {
  cleaner: "Cleaner",
  site_supervisor: "Supervisor",
  area_manager: "Area Manager",
  operations_manager: "Operations Manager",
  organization_administrator: "Director",
  client_viewer: "Client",
};

export async function getAppAccessContext(
  existingClient?: SupabaseClient,
): Promise<AppAccessContext> {
  const client = existingClient ?? (await createSupabaseServerClient());
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  const userId =
    typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsError || !userId) throw new Error("Authentication required.");

  const membershipResult = await client
    .from("memberships")
    .select("id,role")
    .eq("organization_id", HOSTED_DEMO_ORGANIZATION_ID)
    .eq("user_id", userId)
    .eq("state", "active")
    .maybeSingle();
  const membership = membershipSchema.safeParse(membershipResult.data);
  if (membershipResult.error || !membership.success) {
    throw new Error("Active CleanOps membership required.");
  }

  const role = membership.data.role;
  let sites: AccessSite[] = [];

  if (
    role === "organization_administrator" ||
    role === "operations_manager"
  ) {
    const result = await client
      .from("sites")
      .select("id,name,city")
      .eq("organization_id", HOSTED_DEMO_ORGANIZATION_ID)
      .order("name");
    const parsed = z.array(siteSchema).safeParse(result.data);
    if (result.error || !parsed.success) {
      throw new Error("Casino access could not be loaded.");
    }
    sites = parsed.data;
  } else {
    const now = new Date().toISOString();
    const accessResult = await client
      .from("member_site_access")
      .select("site_id")
      .eq("organization_id", HOSTED_DEMO_ORGANIZATION_ID)
      .eq("membership_id", membership.data.id)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`);
    const accessRows = z.array(accessRowSchema).safeParse(accessResult.data);
    if (accessResult.error || !accessRows.success) {
      throw new Error("Casino access could not be loaded.");
    }

    const siteIds = [...new Set(accessRows.data.map((entry) => entry.site_id))];
    if (siteIds.length) {
      const siteResult = await client
        .from("sites")
        .select("id,name,city")
        .eq("organization_id", HOSTED_DEMO_ORGANIZATION_ID)
        .in("id", siteIds)
        .order("name");
      const parsed = z.array(siteSchema).safeParse(siteResult.data);
      if (siteResult.error || !parsed.success) {
        throw new Error("Casino access could not be loaded.");
      }
      sites = parsed.data;
    }
  }

  const director = role === "organization_administrator";
  const operationalManager =
    director ||
    role === "operations_manager" ||
    role === "area_manager" ||
    role === "site_supervisor";

  return {
    userId,
    membershipId: membership.data.id,
    role,
    roleLabel: roleLabels[role],
    sites,
    canManageOperations: operationalManager,
    canReviewEvidence: operationalManager,
    canViewFinance: director || role === "area_manager",
    canEditFinance: director,
    canViewIncidents: operationalManager,
    canViewReports: operationalManager || role === "client_viewer" || director,
    canUseCleanerMobile: director || role === "cleaner",
  };
}

export function resolveSelectedSite(
  access: AppAccessContext,
  requestedSiteId?: string,
): AccessSite | null {
  if (!access.sites.length) return null;
  return (
    access.sites.find((site) => site.id === requestedSiteId) ?? access.sites[0]
  );
}

export function isSiteAllowed(
  access: AppAccessContext,
  siteId: string,
): boolean {
  return access.sites.some((site) => site.id === siteId);
}
