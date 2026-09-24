import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { hasHostedDemoAccess, isHostedDemoEnabled } from "@/services/hosted-demo";

export const DEMO_REVIEW_TASK_ID = "81000000-0000-4000-8000-000000000001";

export type ReviewRuntime = {
  accessClient: SupabaseClient;
  writeClient: SupabaseClient;
  actorUserId: string | null;
  demo: boolean;
};

export async function getReviewRuntime(): Promise<ReviewRuntime> {
  const demoConfig = getDemoIngressConfig();
  const writeClient = createPrivilegedSupabaseClient();
  const accessClient = await createSupabaseServerClient();
  const { data, error } = await accessClient.auth.getClaims();
  const actorUserId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !actorUserId) throw new Error("Authentication required.");
  if (demoConfig.enabled) {
    if (!await hasHostedDemoAccess(accessClient, actorUserId, "supervisor")) throw new Error("Supervisor access required.");
    return {
      accessClient: writeClient,
      writeClient,
      actorUserId,
      demo: true,
    };
  }
  const hostedDemo = await hasHostedDemoAccess(accessClient, actorUserId, "supervisor");
  if (isHostedDemoEnabled() && !hostedDemo) throw new Error("Supervisor access required.");
  return {
    accessClient,
    writeClient: hostedDemo ? writeClient : accessClient,
    actorUserId,
    demo: hostedDemo,
  };
}
