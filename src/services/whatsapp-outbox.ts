import "server-only";
import { z } from "zod";
import { outboundMessageSchema, type OutboundMessage } from "@/schemas/whatsapp";

const sendResponseSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1) }).passthrough();

export type ClaimedWhatsAppReply = {
  outboxId: string; phoneNumberId: string; recipientId: string;
  payload: OutboundMessage; attemptCount: number;
};

export type EnqueueWhatsAppReply = {
  organizationId: string;
  integrationAccountId: string;
  recipientId: string;
  logicalKey: string;
  payload: OutboundMessage;
  consentReference: string;
  conversationWindowExpiresAt: string | null;
};

export interface WhatsAppOutboxRepository {
  claim(workerId: string, leaseSeconds: number): Promise<ClaimedWhatsAppReply | null>;
  markSent(outboxId: string, workerId: string, providerMessageId: string): Promise<void>;
  fail(outboxId: string, workerId: string, errorCode: string, retrySeconds: number): Promise<"pending" | "failed">;
}

function providerPayload(reply: ClaimedWhatsAppReply) {
  if (reply.payload.type === "text") {
    return { messaging_product: "whatsapp", recipient_type: "individual", to: reply.recipientId, type: "text", text: { preview_url: false, body: reply.payload.text } };
  }
  return { messaging_product: "whatsapp", recipient_type: "individual", to: reply.recipientId, type: "template", template: { name: reply.payload.templateName, language: { code: reply.payload.languageCode } } };
}

export async function processNextWhatsAppReply(
  repository: WhatsAppOutboxRepository,
  options: { workerId: string; leaseSeconds: number; accessToken: string; graphVersion: string; fetchImpl?: typeof fetch },
) {
  const reply = await repository.claim(options.workerId, options.leaseSeconds);
  if (!reply) return { status: "idle" as const };
  const parsed = outboundMessageSchema.safeParse(reply.payload);
  if (!parsed.success) {
    await repository.fail(reply.outboxId, options.workerId, "invalid_outbound_payload", 30);
    return { status: "failed" as const, errorCode: "invalid_outbound_payload" as const };
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(`https://graph.facebook.com/${options.graphVersion}/${encodeURIComponent(reply.phoneNumberId)}/messages`, {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${options.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(providerPayload({ ...reply, payload: parsed.data })),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("provider_send_failed");
    const provider = sendResponseSchema.safeParse(await response.json());
    if (!provider.success) throw new Error("invalid_provider_response");
    await repository.markSent(reply.outboxId, options.workerId, provider.data.messages[0]!.id);
    return { status: "sent" as const, outboxId: reply.outboxId };
  } catch {
    const status = await repository.fail(reply.outboxId, options.workerId, "provider_send_failed", 30);
    return { status, outboxId: reply.outboxId, errorCode: "provider_send_failed" as const };
  }
}
