import { createSupabaseWhatsAppRepository } from "@/integrations/whatsapp/supabase-whatsapp";
import {
  getMakeWhatsAppIngressConfig,
  handleMakeWhatsAppPost,
} from "@/services/make-whatsapp-ingress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = getMakeWhatsAppIngressConfig();
  } catch {
    return Response.json({ error: "make_whatsapp_not_configured" }, { status: 503 });
  }

  if (!config.enabled) return new Response("Not found", { status: 404 });
  const repository = createSupabaseWhatsAppRepository();
  return handleMakeWhatsAppPost(request, repository, repository, config);
}
