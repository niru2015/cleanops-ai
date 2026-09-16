import "server-only";
import { storedMockEnvelopeSchema } from "@/schemas/mock-message";
import type { EvidenceObjectStorage, EvidenceRepository } from "@/services/evidence-repository";
import { ingestEvidenceBytes, recordEvidenceMediaProblem } from "@/services/evidence-media";
import type { IngressRepository } from "@/services/ingress-repository";
import { WhatsAppMediaError, type WhatsAppMediaClient } from "@/services/whatsapp-media";

export interface WhatsAppEvidenceRetryRepository extends EvidenceRepository {
  retryWhatsAppEvidence(evidenceId: string): Promise<{
    accountExternalId: string;
    externalMessageId: string;
    mediaExternalId: string;
    declaredContentType: string | null;
  }>;
}

export async function processWhatsAppEvidenceRetry(
  evidence: WhatsAppEvidenceRetryRepository,
  storage: EvidenceObjectStorage,
  media: WhatsAppMediaClient,
  evidenceId: string,
) {
  const source = await evidence.retryWhatsAppEvidence(evidenceId);
  try {
    const downloaded = await media.download(source.mediaExternalId);
    return await ingestEvidenceBytes(evidence, storage, source, downloaded.bytes);
  } catch (error) {
    const code = error instanceof WhatsAppMediaError ? error.code : "media_processing_failed";
    const status = code === "too_large" || code === "unsafe_url" ? "quarantined" : "missing";
    return recordEvidenceMediaProblem(evidence, source, status, code);
  }
}

export async function processNextWhatsAppIngressJob(
  ingress: IngressRepository,
  evidence: EvidenceRepository,
  storage: EvidenceObjectStorage,
  media: WhatsAppMediaClient,
  options: { workerId: string; leaseSeconds: number; retryDelaySeconds?: number },
) {
  const job = await ingress.claimJob(options.workerId, options.leaseSeconds);
  if (!job) return { status: "idle" as const };

  const envelope = storedMockEnvelopeSchema.safeParse(job.payload);
  if (!envelope.success) {
    const status = await ingress.failJob(
      job.jobId,
      options.workerId,
      "invalid_envelope",
      options.retryDelaySeconds ?? 30,
    );
    return { status, jobId: job.jobId, errorCode: "invalid_envelope" as const };
  }

  let completed;
  try {
    completed = await ingress.completeJob(job.jobId, options.workerId, envelope.data.messages);
  } catch {
    const status = await ingress.failJob(
      job.jobId,
      options.workerId,
      "normalization_failed",
      options.retryDelaySeconds ?? 30,
    );
    return { status, jobId: job.jobId, errorCode: "normalization_failed" as const };
  }

  const mediaResults: unknown[] = [];
  for (const message of envelope.data.messages) {
    for (const reference of message.mediaRefs) {
        const source = {
          accountExternalId: envelope.data.accountExternalId,
          externalMessageId: message.externalMessageId,
          mediaExternalId: reference.externalId,
          declaredContentType: reference.contentType ?? null,
        };
        try {
          const staged = await evidence.begin({
            externalAccountId: source.accountExternalId,
            externalMessageId: source.externalMessageId,
            mediaExternalId: source.mediaExternalId,
            contentType: null,
            byteSize: null,
            sha256: null,
          });
          if (staged.processingStatus !== "staged") {
            mediaResults.push({ mediaExternalId: reference.externalId, status: staged.processingStatus });
            continue;
          }
          const downloaded = await media.download(reference.externalId);
          mediaResults.push(await ingestEvidenceBytes(evidence, storage, source, downloaded.bytes));
      } catch (error) {
        const code = error instanceof WhatsAppMediaError ? error.code : "media_processing_failed";
        const status = code === "too_large" || code === "unsafe_url" ? "quarantined" : "missing";
        try {
          mediaResults.push(await recordEvidenceMediaProblem(evidence, source, status, code));
        } catch {
          mediaResults.push({ mediaExternalId: reference.externalId, status: "unavailable", errorCode: code });
        }
      }
    }
  }
  return { status: "succeeded" as const, jobId: job.jobId, ...completed, mediaResults };
}
