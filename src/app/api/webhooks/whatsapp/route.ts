import { timingSafeEqual } from "node:crypto";
import { createSupabaseWhatsAppRepository } from "@/integrations/whatsapp/supabase-whatsapp";
import { getWhatsAppConfig } from "@/services/whatsapp-config";
import { handleWhatsAppPost } from "@/services/whatsapp-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameToken(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  let config;
  try { config = getWhatsAppConfig(); } catch { return new Response("Not found", { status: 404 }); }
  if (!config.enabled) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("hub.mode") !== "subscribe" || !sameToken(url.searchParams.get("hub.verify_token") ?? "", config.verifyToken)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let config;
  try { config = getWhatsAppConfig(); } catch { return Response.json({ error: "whatsapp_not_configured" }, { status: 503 }); }
  if (!config.enabled) return new Response("Not found", { status: 404 });
  const repository = createSupabaseWhatsAppRepository();
  return handleWhatsAppPost(request, repository, repository, config.appSecret);
}
