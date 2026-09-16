import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { MockMessage } from "@/schemas/mock-message";
import { whatsappWebhookSchema, type WhatsAppStatus } from "@/schemas/whatsapp";
import type { AcceptedEnvelope, IngressRepository } from "@/services/ingress-repository";

export interface WhatsAppStatusRepository {
  recordStatuses(phoneNumberId: string, statuses: WhatsAppStatus[]): Promise<void>;
}

export function verifyWhatsAppSignature(rawBody: Uint8Array, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const supplied = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

function normalizedMessage(message: Record<string, unknown>): MockMessage | null {
  const media = ["image", "document", "video", "audio", "sticker"]
    .map((key) => message[key] as { id?: string; mime_type?: string } | undefined)
    .find((item) => item?.id);
  const text = (message.text as { body?: string } | undefined)?.body;
  if (!text && !media?.id) return null;
  const sender = String(message.from);
  return {
    externalMessageId: String(message.id), externalThreadId: sender, senderId: sender,
    occurredAt: new Date(Number(message.timestamp) * 1000).toISOString(), text,
    mediaRefs: media?.id ? [{ externalId: media.id, contentType: media.mime_type }] : [], schemaVersion: 1,
  };
}

export async function acceptWhatsAppWebhook(
  repository: IngressRepository,
  statusRepository: WhatsAppStatusRepository,
  rawBody: Uint8Array,
) {
  const parsedJson: unknown = JSON.parse(new TextDecoder().decode(rawBody));
  const parsed = whatsappWebhookSchema.parse(parsedJson);
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const accepted: AcceptedEnvelope[] = [];
  let statusCount = 0;
  let changeIndex = 0;

  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const phoneNumberId = change.value.metadata.phone_number_id;
      const messages = (change.value.messages ?? []).map((message) => normalizedMessage(message)).filter((item): item is MockMessage => item !== null);
      if (messages.length > 0) {
        const payload = { schemaVersion: 1 as const, providerEventId: null, accountExternalId: phoneNumberId, messages };
        accepted.push(await repository.acceptEnvelope({
          externalAccountId: phoneNumberId,
          dedupeKey: `sha256:${digest}:${changeIndex}`,
          payload,
          payloadSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
        }));
      }
      if (change.value.statuses?.length) {
        await statusRepository.recordStatuses(phoneNumberId, change.value.statuses);
        statusCount += change.value.statuses.length;
      }
      changeIndex += 1;
    }
  }
  return { accepted: true as const, envelopeCount: accepted.length, duplicateCount: accepted.filter((item) => item.duplicate).length, statusCount };
}

export async function handleWhatsAppPost(
  request: Request,
  repository: IngressRepository,
  statusRepository: WhatsAppStatusRepository,
  appSecret: string,
) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 1_000_000) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > 1_000_000) return Response.json({ error: "payload_too_large" }, { status: 413 });
  if (!verifyWhatsAppSignature(body, request.headers.get("x-hub-signature-256"), appSecret)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }
  try {
    return Response.json(await acceptWhatsAppWebhook(repository, statusRepository, body), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const unavailable = error instanceof Error && (error.message === "account_not_found" || error.message === "database_unavailable");
    return Response.json({ error: unavailable ? error.message : "invalid_webhook" }, { status: unavailable ? 503 : 400 });
  }
}
