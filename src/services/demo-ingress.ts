import { createHash } from "node:crypto";
import type { MockAccountEntry, MockMessageBatch } from "@/schemas/mock-message";
import type { AcceptedEnvelope, IngressRepository } from "@/services/ingress-repository";

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function envelopeFor(batch: MockMessageBatch, entry: MockAccountEntry) {
  const payload = {
    schemaVersion: batch.schemaVersion,
    providerEventId: batch.eventId ?? null,
    accountExternalId: entry.accountExternalId,
    messages: entry.messages,
  } satisfies Record<string, unknown>;
  const payloadSha256 = digest(payload);
  const dedupeKey = batch.eventId
    ? `event:${batch.eventId}:${entry.accountExternalId}`
    : `sha256:${payloadSha256}`;

  return { payload, payloadSha256, dedupeKey };
}

export async function acceptDemoMessageBatch(
  repository: IngressRepository,
  batch: MockMessageBatch,
) {
  const accepted: AcceptedEnvelope[] = [];

  for (const entry of batch.entries) {
    const envelope = envelopeFor(batch, entry);
    accepted.push(
      await repository.acceptEnvelope({
        externalAccountId: entry.accountExternalId,
        providerEventId: batch.eventId,
        ...envelope,
      }),
    );
  }

  return {
    accepted: true as const,
    envelopeCount: accepted.length,
    duplicateCount: accepted.filter((item) => item.duplicate).length,
    envelopes: accepted,
  };
}
