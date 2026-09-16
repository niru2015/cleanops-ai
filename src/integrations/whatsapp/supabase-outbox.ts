import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { outboundMessageSchema } from "@/schemas/whatsapp";
import type { ClaimedWhatsAppReply, EnqueueWhatsAppReply, WhatsAppOutboxRepository } from "@/services/whatsapp-outbox";

export class SupabaseWhatsAppOutboxRepository implements WhatsAppOutboxRepository {
  constructor(private readonly client: SupabaseClient) {}
  async enqueue(input: EnqueueWhatsAppReply) {
    const payload = outboundMessageSchema.parse(input.payload);
    const { data, error } = await this.client.rpc("enqueue_whatsapp_reply", {
      p_organization_id: input.organizationId,
      p_integration_account_id: input.integrationAccountId,
      p_recipient_id: input.recipientId,
      p_logical_key: input.logicalKey,
      p_payload: payload,
      p_consent_reference: input.consentReference,
      p_conversation_window_expires_at: input.conversationWindowExpiresAt,
    });
    if (error || typeof data !== "string") throw new Error("outbox_unavailable");
    return data;
  }
  async claim(workerId: string, leaseSeconds: number): Promise<ClaimedWhatsAppReply | null> {
    const { data, error } = await this.client.rpc("claim_whatsapp_reply", { p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    if (error) throw new Error("outbox_unavailable");
    const value = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    if (!value) return null;
    const payload = outboundMessageSchema.safeParse(value.payload);
    if (!payload.success || typeof value.outbox_id !== "string" || typeof value.external_account_id !== "string" || typeof value.recipient_id !== "string" || typeof value.attempt_count !== "number") throw new Error("invalid_outbox_response");
    return { outboxId: value.outbox_id, phoneNumberId: value.external_account_id, recipientId: value.recipient_id, payload: payload.data, attemptCount: value.attempt_count };
  }
  async markSent(outboxId: string, workerId: string, providerMessageId: string) {
    const { error } = await this.client.rpc("mark_whatsapp_reply_sent", { p_outbox_id: outboxId, p_worker_id: workerId, p_provider_message_id: providerMessageId });
    if (error) throw new Error("outbox_unavailable");
  }
  async fail(outboxId: string, workerId: string, errorCode: string, retrySeconds: number) {
    const { data, error } = await this.client.rpc("fail_whatsapp_reply", { p_outbox_id: outboxId, p_worker_id: workerId, p_error_code: errorCode, p_retry_seconds: retrySeconds });
    if (error || (data !== "pending" && data !== "failed")) throw new Error("outbox_unavailable");
    return data;
  }
}

export function createSupabaseWhatsAppOutboxRepository() {
  return new SupabaseWhatsAppOutboxRepository(createPrivilegedSupabaseClient());
}
