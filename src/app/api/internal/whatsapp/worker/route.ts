import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSupabaseWhatsAppEvidenceDependencies } from "@/integrations/evidence/supabase-evidence";
import { createSupabaseWhatsAppOutboxRepository } from "@/integrations/whatsapp/supabase-outbox";
import { createSupabaseWhatsAppRepository } from "@/integrations/whatsapp/supabase-whatsapp";
import { getWhatsAppConfig } from "@/services/whatsapp-config";
import { WhatsAppMediaClient } from "@/services/whatsapp-media";
import { processNextWhatsAppReply } from "@/services/whatsapp-outbox";
import { processNextWhatsAppIngressJob, processWhatsAppEvidenceRetry } from "@/services/whatsapp-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const commandSchema = z.object({ retryEvidenceId: z.uuid().optional() }).strict();

function authorized(request: Request, token: string) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  let config;
  try { config = getWhatsAppConfig(); } catch { return Response.json({ error: "whatsapp_not_configured" }, { status: 503 }); }
  if (!config.enabled) return new Response("Not found", { status: 404 });
  if (!authorized(request, config.workerToken)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rawCommand = await request.text();
  if (rawCommand.length > 1_000) return Response.json({ error: "payload_too_large" }, { status: 413 });
  let commandValue: unknown = {};
  try { commandValue = rawCommand ? JSON.parse(rawCommand) : {}; } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const command = commandSchema.safeParse(commandValue);
  if (!command.success) return Response.json({ error: "invalid_command" }, { status: 400 });

  const ingress = createSupabaseWhatsAppRepository();
  const evidence = createSupabaseWhatsAppEvidenceDependencies();
  const media = new WhatsAppMediaClient(config.accessToken, config.graphVersion);
  if (command.data.retryEvidenceId) {
    const retry = await processWhatsAppEvidenceRetry(
      evidence.repository,
      evidence.storage,
      media,
      command.data.retryEvidenceId,
    );
    return Response.json({ retry }, { headers: { "cache-control": "no-store" } });
  }
  const inbound = await processNextWhatsAppIngressJob(
    ingress,
    evidence.repository,
    evidence.storage,
    media,
    { workerId: config.workerId, leaseSeconds: 60 },
  );
  const outbound = await processNextWhatsAppReply(createSupabaseWhatsAppOutboxRepository(), {
    workerId: config.workerId,
    leaseSeconds: 60,
    accessToken: config.accessToken,
    graphVersion: config.graphVersion,
  });
  return Response.json({ inbound, outbound }, { headers: { "cache-control": "no-store" } });
}
