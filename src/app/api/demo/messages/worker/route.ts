import { createSupabaseIngressRepository } from "@/integrations/mock-whatsapp/supabase-ingress-repository";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import {
  demoIngressDisabledResponse,
  handleDemoWorkerRequest,
} from "@/services/demo-ingress-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = getDemoIngressConfig();
  } catch {
    return Response.json(
      { error: "demo_ingress_not_configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (!config.enabled) return demoIngressDisabledResponse();

  return handleDemoWorkerRequest(request, createSupabaseIngressRepository(), config);
}
