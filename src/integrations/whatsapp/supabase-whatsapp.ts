import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseIngressRepository } from "@/integrations/mock-whatsapp/supabase-ingress-repository";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import type { WhatsAppStatusRepository } from "@/services/whatsapp-webhook";
import type { AcceptEnvelopeInput, AcceptedEnvelope } from "@/services/ingress-repository";
import { IngressRepositoryError } from "@/services/ingress-repository";
import type { WhatsAppStatus } from "@/schemas/whatsapp";

function row(data: unknown) {
  return Array.isArray(data) && data[0] && typeof data[0] === "object" ? data[0] as Record<string, unknown> : null;
}

export class SupabaseWhatsAppRepository extends SupabaseIngressRepository implements WhatsAppStatusRepository {
  constructor(client: SupabaseClient) { super(client); }

  override async acceptEnvelope(input: AcceptEnvelopeInput): Promise<AcceptedEnvelope> {
    const { data, error } = await this.client.rpc("accept_whatsapp_ingress_event", {
      p_external_account_id: input.externalAccountId,
      p_dedupe_key: input.dedupeKey,
      p_payload: input.payload,
      p_payload_sha256: input.payloadSha256,
    });
    if (error) throw new IngressRepositoryError(error.message.includes("integration_account_not_found") ? "account_not_found" : "database_unavailable");
    const result = row(data);
    if (!result || typeof result.event_id !== "string" || typeof result.job_id !== "string" || typeof result.duplicate !== "boolean") {
      throw new IngressRepositoryError("invalid_database_response");
    }
    return { eventId: result.event_id, jobId: result.job_id, duplicate: result.duplicate };
  }

  async recordStatuses(phoneNumberId: string, statuses: WhatsAppStatus[]) {
    for (const status of statuses) {
      const { error } = await this.client.rpc("record_whatsapp_delivery_status", {
        p_external_account_id: phoneNumberId,
        p_provider_message_id: status.id,
        p_status: status.status,
        p_occurred_at: new Date(Number(status.timestamp) * 1000).toISOString(),
        p_error_code: status.errors?.[0]?.code ? String(status.errors[0].code) : null,
      });
      if (error) throw new IngressRepositoryError(error.message.includes("integration_account_not_found") ? "account_not_found" : "database_unavailable");
    }
  }
}

export function createSupabaseWhatsAppRepository() {
  return new SupabaseWhatsAppRepository(createPrivilegedSupabaseClient());
}
