import { storedMockEnvelopeSchema } from "@/schemas/mock-message";
import type { IngressRepository } from "@/services/ingress-repository";

export async function processNextIngressJob(
  repository: IngressRepository,
  options: { workerId: string; leaseSeconds: number; retryDelaySeconds?: number },
) {
  const job = await repository.claimJob(options.workerId, options.leaseSeconds);

  if (!job) {
    return { status: "idle" as const };
  }

  const envelope = storedMockEnvelopeSchema.safeParse(job.payload);
  if (!envelope.success) {
    const status = await repository.failJob(
      job.jobId,
      options.workerId,
      "invalid_envelope",
      options.retryDelaySeconds ?? 30,
    );
    return { status, jobId: job.jobId, errorCode: "invalid_envelope" as const };
  }

  try {
    const completed = await repository.completeJob(
      job.jobId,
      options.workerId,
      envelope.data.messages,
    );
    return { status: "succeeded" as const, jobId: job.jobId, ...completed };
  } catch {
    const status = await repository.failJob(
      job.jobId,
      options.workerId,
      "normalization_failed",
      options.retryDelaySeconds ?? 30,
    );
    return { status, jobId: job.jobId, errorCode: "normalization_failed" as const };
  }
}
