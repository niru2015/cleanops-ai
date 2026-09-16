import "server-only";
import { z } from "zod";

const schema = z.object({
  WHATSAPP_CLOUD_ENABLED: z.enum(["true", "false"]).default("false"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(24),
  WHATSAPP_APP_SECRET: z.string().min(24),
  WHATSAPP_ACCESS_TOKEN: z.string().min(24),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/),
  WHATSAPP_WORKER_TOKEN: z.string().min(24),
  WHATSAPP_WORKER_ID: z.string().min(1).max(120).default("cleanops-whatsapp-worker"),
});

export function getWhatsAppConfig(environment: Record<string, string | undefined> = process.env) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error("WhatsApp Cloud API is not configured.");
  return {
    enabled: parsed.data.WHATSAPP_CLOUD_ENABLED === "true",
    verifyToken: parsed.data.WHATSAPP_VERIFY_TOKEN,
    appSecret: parsed.data.WHATSAPP_APP_SECRET,
    accessToken: parsed.data.WHATSAPP_ACCESS_TOKEN,
    graphVersion: parsed.data.WHATSAPP_GRAPH_VERSION,
    workerToken: parsed.data.WHATSAPP_WORKER_TOKEN,
    workerId: parsed.data.WHATSAPP_WORKER_ID,
  };
}
