import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";

export const DEMO_REPORTING_ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_REPORTING_SITE_ID = "40000000-0000-4000-8000-000000000001";
export const DEMO_REPORTING_ZONE_ID = "50000000-0000-4000-8000-000000000004";
export const DEMO_REPORTING_WORKER_ID = "60000000-0000-4000-8000-000000000001";
export const DEMO_SLA_DEFINITION_ID = "d2000000-0000-4000-8000-000000000001";
export const DEMO_REPORTING_SUPERVISOR_ID = "00000000-0000-4000-8000-000000000002";
export const DEMO_CLIENT_VIEWER_ID = "00000000-0000-4000-8000-000000000005";

export type ReportingRuntime = {
  accessClient: SupabaseClient;
  actorUserId: string;
  demo: boolean;
};

export async function getReportingRuntime(demoRole: "supervisor" | "client" = "supervisor"): Promise<ReportingRuntime> {
  const demo = getDemoIngressConfig().enabled;
  if (demo) {
    return {
      accessClient: createPrivilegedSupabaseClient(),
      actorUserId: demoRole === "client" ? DEMO_CLIENT_VIEWER_ID : DEMO_REPORTING_SUPERVISOR_ID,
      demo: true,
    };
  }

  const accessClient = await createSupabaseServerClient();
  const { data, error } = await accessClient.auth.getClaims();
  const actorUserId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !actorUserId) throw new Error("Authentication required.");
  return { accessClient, actorUserId, demo: false };
}
