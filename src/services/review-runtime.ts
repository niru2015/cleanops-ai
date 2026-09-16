import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";

export const DEMO_REVIEW_TASK_ID = "81000000-0000-4000-8000-000000000001";
export const DEMO_SUPERVISOR_USER_ID = "00000000-0000-4000-8000-000000000002";

export type ReviewRuntime = {
  accessClient: SupabaseClient;
  writeClient: SupabaseClient;
  actorUserId: string | null;
  demo: boolean;
};

export async function getReviewRuntime(): Promise<ReviewRuntime> {
  const demoConfig = getDemoIngressConfig();
  const writeClient = createPrivilegedSupabaseClient();
  if (demoConfig.enabled) {
    return {
      accessClient: writeClient,
      writeClient,
      actorUserId: DEMO_SUPERVISOR_USER_ID,
      demo: true,
    };
  }

  const accessClient = await createSupabaseServerClient();
  const { data, error } = await accessClient.auth.getClaims();
  const actorUserId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !actorUserId) throw new Error("Authentication required.");
  return { accessClient, writeClient, actorUserId, demo: false };
}
