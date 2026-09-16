import type { MockMessage } from "@/schemas/mock-message";

export type AcceptEnvelopeInput = {
  externalAccountId: string;
  providerEventId?: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  payloadSha256: string;
};

export type AcceptedEnvelope = {
  eventId: string;
  jobId: string;
  duplicate: boolean;
};

export type ClaimedJob = {
  jobId: string;
  integrationEventId: string;
  organizationId: string;
  integrationAccountId: string;
  payload: unknown;
  attemptCount: number;
  leaseExpiresAt: string;
};

export type CompletedJob = {
  insertedCount: number;
  messageCount: number;
};

export interface IngressRepository {
  acceptEnvelope(input: AcceptEnvelopeInput): Promise<AcceptedEnvelope>;
  claimJob(workerId: string, leaseSeconds: number): Promise<ClaimedJob | null>;
  completeJob(jobId: string, workerId: string, messages: MockMessage[]): Promise<CompletedJob>;
  failJob(
    jobId: string,
    workerId: string,
    errorCode: string,
    retryDelaySeconds: number,
  ): Promise<"pending" | "failed">;
  retryFailedJob(jobId: string): Promise<boolean>;
}

export class IngressRepositoryError extends Error {
  constructor(
    readonly code:
      | "account_not_found"
      | "database_unavailable"
      | "invalid_database_response"
      | "job_not_owned",
  ) {
    super(code);
    this.name = "IngressRepositoryError";
  }
}
