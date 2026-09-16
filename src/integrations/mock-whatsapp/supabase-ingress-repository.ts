import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import type { MockMessage } from "@/schemas/mock-message";
import {
  IngressRepositoryError,
  type AcceptEnvelopeInput,
  type AcceptedEnvelope,
  type ClaimedJob,
  type CompletedJob,
  type IngressRepository,
} from "@/services/ingress-repository";

type Row = Record<string, unknown>;

function firstRow(data: unknown): Row | null {
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") return null;
  return data[0] as Row;
}

function databaseError(error: { message?: string } | null) {
  if (error?.message?.includes("integration_account_not_found")) {
    return new IngressRepositoryError("account_not_found");
  }
  if (error?.message?.includes("job_not_owned")) {
    return new IngressRepositoryError("job_not_owned");
  }
  return new IngressRepositoryError("database_unavailable");
}

export class SupabaseIngressRepository implements IngressRepository {
  constructor(protected readonly client: SupabaseClient) {}

  async acceptEnvelope(input: AcceptEnvelopeInput): Promise<AcceptedEnvelope> {
    const { data, error } = await this.client.rpc("accept_mock_ingress_event", {
      p_external_account_id: input.externalAccountId,
      p_provider_event_id: input.providerEventId ?? null,
      p_dedupe_key: input.dedupeKey,
      p_payload: input.payload,
      p_payload_sha256: input.payloadSha256,
    });

    if (error) throw databaseError(error);
    const row = firstRow(data);
    if (
      !row ||
      typeof row.event_id !== "string" ||
      typeof row.job_id !== "string" ||
      typeof row.duplicate !== "boolean"
    ) {
      throw new IngressRepositoryError("invalid_database_response");
    }

    return { eventId: row.event_id, jobId: row.job_id, duplicate: row.duplicate };
  }

  async claimJob(workerId: string, leaseSeconds: number): Promise<ClaimedJob | null> {
    const { data, error } = await this.client.rpc("claim_processing_job", {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });

    if (error) throw databaseError(error);
    if (Array.isArray(data) && data.length === 0) return null;
    const row = firstRow(data);
    if (
      !row ||
      typeof row.job_id !== "string" ||
      typeof row.integration_event_id !== "string" ||
      typeof row.organization_id !== "string" ||
      typeof row.integration_account_id !== "string" ||
      typeof row.attempt_count !== "number" ||
      typeof row.lease_expires_at !== "string"
    ) {
      throw new IngressRepositoryError("invalid_database_response");
    }

    return {
      jobId: row.job_id,
      integrationEventId: row.integration_event_id,
      organizationId: row.organization_id,
      integrationAccountId: row.integration_account_id,
      payload: row.payload,
      attemptCount: row.attempt_count,
      leaseExpiresAt: row.lease_expires_at,
    };
  }

  async completeJob(
    jobId: string,
    workerId: string,
    messages: MockMessage[],
  ): Promise<CompletedJob> {
    const { data, error } = await this.client.rpc("complete_processing_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_messages: messages,
    });

    if (error) throw databaseError(error);
    const row = firstRow(data);
    if (
      !row ||
      typeof row.inserted_count !== "number" ||
      typeof row.message_count !== "number"
    ) {
      throw new IngressRepositoryError("invalid_database_response");
    }

    return { insertedCount: row.inserted_count, messageCount: row.message_count };
  }

  async failJob(
    jobId: string,
    workerId: string,
    errorCode: string,
    retryDelaySeconds: number,
  ) {
    const { data, error } = await this.client.rpc("fail_processing_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error_code: errorCode,
      p_retry_delay_seconds: retryDelaySeconds,
    });

    if (error) throw databaseError(error);
    if (data !== "pending" && data !== "failed") {
      throw new IngressRepositoryError("invalid_database_response");
    }
    return data;
  }

  async retryFailedJob(jobId: string) {
    const { data, error } = await this.client.rpc("retry_failed_processing_job", {
      p_job_id: jobId,
    });

    if (error) throw databaseError(error);
    if (typeof data !== "boolean") {
      throw new IngressRepositoryError("invalid_database_response");
    }
    return data;
  }
}

export function createSupabaseIngressRepository() {
  return new SupabaseIngressRepository(createPrivilegedSupabaseClient());
}
