import { createSupabaseEvidenceDependencies } from "@/integrations/evidence/supabase-evidence";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { demoIngressDisabledResponse } from "@/services/demo-ingress-http";
import { handleEvidenceReconcileRequest } from "@/services/evidence-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = getDemoIngressConfig();
  } catch {
    return Response.json(
      { error: "demo_evidence_not_configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!config.enabled) return demoIngressDisabledResponse();

  const { repository, storage } = createSupabaseEvidenceDependencies();
  return handleEvidenceReconcileRequest(request, repository, storage, config);
}
