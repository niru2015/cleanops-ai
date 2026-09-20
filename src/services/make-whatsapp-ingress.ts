import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { IngressRepository } from "@/services/ingress-repository";
import {
  acceptWhatsAppWebhook,
  type WhatsAppStatusRepository,
} from "@/services/whatsapp-webhook";

const MAX_BODY_BYTES = 1_000_000;

const makeTimestampSchema = z.union([
  z.string().regex(/^\d{1,20}$/),
  z.string().datetime({ offset: true }),
  z.number().int().nonnegative(),
]);

const makeMediaSchema = z.object({
  id: z.string().min(1).max(255),
  mime_type: z.string().max(120).optional(),
}).passthrough();

const makeMessageSchema = z.object({
  id: z.string().min(1).max(255),
  from: z.string().min(1).max(64),
  timestamp: makeTimestampSchema,
  type: z.string().min(1).max(40),
  text: z.object({ body: z.string().max(8000) }).passthrough().optional(),
  image: makeMediaSchema.optional(),
  document: makeMediaSchema.optional(),
  video: makeMediaSchema.optional(),
  audio: makeMediaSchema.optional(),
  sticker: makeMediaSchema.optional(),
}).passthrough();

const makeStatusSchema = z.object({
  id: z.string().min(1).max(255),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: makeTimestampSchema,
  recipient_id: z.string().min(1).max(64).optional(),
  errors: z.array(z.object({
    code: z.number().int(),
    title: z.string().optional(),
  }).passthrough()).max(20).optional(),
}).passthrough();

const makeWhatsAppEventSchema = z.object({
  id: z.string().min(1).max(160),
  field: z.literal("messages"),
  messaging_product: z.literal("whatsapp"),
  metadata: z.object({
    phone_number_id: z.string().min(1).max(160),
  }).passthrough(),
  messages: z.array(makeMessageSchema).max(100).optional(),
  statuses: z.array(makeStatusSchema).max(100).optional(),
}).passthrough().refine(
  (event) => Boolean(event.messages?.length || event.statuses?.length),
  { message: "messages_or_statuses_required" },
);

const configSchema = z.object({
  CLEANOPS_MAKE_WHATSAPP_ENABLED: z.enum(["true", "false"]).default("false"),
  CLEANOPS_MAKE_WHATSAPP_TOKEN: z.string().optional(),
});

export type MakeWhatsAppIngressConfig = {
  enabled: boolean;
  token: string;
};

export function getMakeWhatsAppIngressConfig(
  environment: Record<string, string | undefined> = process.env,
): MakeWhatsAppIngressConfig {
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success) throw new Error("Make WhatsApp ingress is not configured.");

  const enabled = parsed.data.CLEANOPS_MAKE_WHATSAPP_ENABLED === "true";
  if (enabled && (!parsed.data.CLEANOPS_MAKE_WHATSAPP_TOKEN || parsed.data.CLEANOPS_MAKE_WHATSAPP_TOKEN.length < 32)) {
    throw new Error("Make WhatsApp ingress is not configured.");
  }

  return {
    enabled,
    token: parsed.data.CLEANOPS_MAKE_WHATSAPP_TOKEN ?? "",
  };
}

function hasValidToken(request: Request, expectedToken: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function providerTimestamp(timestamp: z.infer<typeof makeTimestampSchema>) {
  if (typeof timestamp === "number") return String(timestamp);
  if (/^\d{1,20}$/.test(timestamp)) return timestamp;
  return String(Math.floor(new Date(timestamp).getTime() / 1000));
}

function toMetaEnvelope(event: z.infer<typeof makeWhatsAppEventSchema>) {
  return {
    object: "whatsapp_business_account" as const,
    entry: [{
      id: event.id,
      changes: [{
        field: "messages" as const,
        value: {
          ...event,
          messages: event.messages?.map((message) => ({
            ...message,
            timestamp: providerTimestamp(message.timestamp),
          })),
          statuses: event.statuses?.map((status) => ({
            ...status,
            timestamp: providerTimestamp(status.timestamp),
          })),
        },
      }],
    }],
  };
}

export async function handleMakeWhatsAppPost(
  request: Request,
  repository: IngressRepository,
  statusRepository: WhatsAppStatusRepository,
  config: MakeWhatsAppIngressConfig,
) {
  if (!config.enabled) return new Response("Not found", { status: 404 });
  if (!hasValidToken(request, config.token)) {
    return Response.json({ error: "invalid_adapter_token" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const event = makeWhatsAppEventSchema.parse(JSON.parse(new TextDecoder().decode(body)));
    const normalizedBody = new TextEncoder().encode(JSON.stringify(toMetaEnvelope(event)));
    const result = await acceptWhatsAppWebhook(repository, statusRepository, normalizedBody);
    return Response.json(result, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const unavailable = error instanceof Error
      && (error.message === "account_not_found" || error.message === "database_unavailable");
    return Response.json(
      { error: unavailable ? error.message : "invalid_make_whatsapp_event" },
      { status: unavailable ? 503 : 400 },
    );
  }
}
