import { describe, expect, it } from "vitest";
import { acceptDemoMessageBatch } from "@/services/demo-ingress";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { handleDemoMessageRequest } from "@/services/demo-ingress-http";
import {
  IngressRepositoryError,
  type AcceptEnvelopeInput,
  type AcceptedEnvelope,
  type ClaimedJob,
  type CompletedJob,
  type IngressRepository,
} from "@/services/ingress-repository";
import { processNextIngressJob } from "@/services/ingress-worker";
import { mockMessageBatchSchema, type MockMessage } from "@/schemas/mock-message";

type MemoryJob = ClaimedJob & {
  status: "pending" | "processing" | "succeeded" | "failed";
  leaseOwner: string | null;
  leaseExpiresAtMs: number | null;
};

class MemoryIngressRepository implements IngressRepository {
  readonly accounts = new Map([
    ["demo-nightshift-group", { accountId: "account-a", organizationId: "tenant-a" }],
    ["demo-harbour-group", { accountId: "account-b", organizationId: "tenant-b" }],
  ]);
  readonly envelopes = new Map<string, AcceptedEnvelope & { organizationId: string }>();
  readonly jobs = new Map<string, MemoryJob>();
  readonly messages = new Set<string>();
  acceptCalls = 0;
  now = Date.parse("2026-09-16T00:00:00Z");
  failOnAcceptCall: number | null = null;

  async acceptEnvelope(input: AcceptEnvelopeInput) {
    this.acceptCalls += 1;
    if (this.failOnAcceptCall === this.acceptCalls) {
      throw new IngressRepositoryError("database_unavailable");
    }

    const account = this.accounts.get(input.externalAccountId);
    if (!account) throw new IngressRepositoryError("account_not_found");

    const key = `${account.accountId}:${input.dedupeKey}`;
    const existing = this.envelopes.get(key);
    if (existing) return { ...existing, duplicate: true };

    const eventId = `event-${this.envelopes.size + 1}`;
    const jobId = `job-${this.jobs.size + 1}`;
    const accepted = { eventId, jobId, duplicate: false, organizationId: account.organizationId };
    this.envelopes.set(key, accepted);
    this.jobs.set(jobId, {
      jobId,
      integrationEventId: eventId,
      organizationId: account.organizationId,
      integrationAccountId: account.accountId,
      payload: input.payload,
      attemptCount: 0,
      leaseExpiresAt: "",
      status: "pending",
      leaseOwner: null,
      leaseExpiresAtMs: null,
    });
    return accepted;
  }

  async claimJob(workerId: string, leaseSeconds: number) {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        candidate.status === "pending" ||
        (candidate.status === "processing" &&
          candidate.leaseExpiresAtMs !== null &&
          candidate.leaseExpiresAtMs <= this.now),
    );
    if (!job) return null;

    job.status = "processing";
    job.attemptCount += 1;
    job.leaseOwner = workerId;
    job.leaseExpiresAtMs = this.now + leaseSeconds * 1000;
    job.leaseExpiresAt = new Date(job.leaseExpiresAtMs).toISOString();
    return { ...job };
  }

  async completeJob(jobId: string, workerId: string, messages: MockMessage[]) {
    const job = this.ownedJob(jobId, workerId);
    let insertedCount = 0;
    for (const message of messages) {
      const key = `${job.integrationAccountId}:${message.externalMessageId}`;
      if (!this.messages.has(key)) {
        this.messages.add(key);
        insertedCount += 1;
      }
    }
    job.status = "succeeded";
    job.leaseOwner = null;
    job.leaseExpiresAtMs = null;
    return { insertedCount, messageCount: messages.length } satisfies CompletedJob;
  }

  async failJob(jobId: string, workerId: string) {
    const job = this.ownedJob(jobId, workerId);
    job.status = "failed";
    job.leaseOwner = null;
    job.leaseExpiresAtMs = null;
    return "failed" as const;
  }

  async retryFailedJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "failed") return false;
    job.status = "pending";
    job.attemptCount = 0;
    return true;
  }

  advance(milliseconds: number) {
    this.now += milliseconds;
  }

  private ownedJob(jobId: string, workerId: string) {
    const job = this.jobs.get(jobId);
    if (
      !job ||
      job.status !== "processing" ||
      job.leaseOwner !== workerId ||
      job.leaseExpiresAtMs === null ||
      job.leaseExpiresAtMs <= this.now
    ) {
      throw new IngressRepositoryError("job_not_owned");
    }
    return job;
  }
}

function message(externalMessageId: string): MockMessage {
  return {
    externalMessageId,
    externalThreadId: "synthetic-thread",
    senderId: "synthetic-sender",
    occurredAt: "2026-09-16T09:00:00Z",
    text: "Synthetic test message",
    mediaRefs: [],
    schemaVersion: 1,
  };
}

function batch(eventId = "provider-event") {
  return mockMessageBatchSchema.parse({
    schemaVersion: 1,
    eventId,
    entries: [
      { accountExternalId: "demo-nightshift-group", messages: [message("message-a")] },
    ],
  });
}

const enabledConfig = {
  enabled: true,
  token: "local-demo-token-at-least-24-characters",
  workerId: "test-worker",
};

describe("CLEAN-003 durable demo ingress", () => {
  it("keeps production access disabled without requiring a demo token", async () => {
    const config = getDemoIngressConfig({
      CLEANOPS_DEMO_INGRESS_ENABLED: "true",
      NODE_ENV: "production",
    });
    const repository = new MemoryIngressRepository();
    const response = await handleDemoMessageRequest(
      new Request("http://localhost/api/demo/messages", { method: "POST" }),
      repository,
      config,
    );

    expect(response.status).toBe(404);
    expect(repository.acceptCalls).toBe(0);
  });

  it("rejects invalid demo authorization before parsing or persistence", async () => {
    const repository = new MemoryIngressRepository();
    const response = await handleDemoMessageRequest(
      new Request("http://localhost/api/demo/messages", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
        body: "not-json",
      }),
      repository,
      enabledConfig,
    );

    expect(response.status).toBe(401);
    expect(repository.acceptCalls).toBe(0);
  });

  it("acknowledges only after every account envelope and job are durable", async () => {
    const repository = new MemoryIngressRepository();
    repository.failOnAcceptCall = 2;
    const requestBatch = {
      schemaVersion: 1,
      eventId: "partial-provider-event",
      entries: [
        { accountExternalId: "demo-nightshift-group", messages: [message("message-a")] },
        { accountExternalId: "demo-harbour-group", messages: [message("message-b")] },
      ],
    };
    const response = await handleDemoMessageRequest(
      new Request("http://localhost/api/demo/messages", {
        method: "POST",
        headers: {
          authorization: `Bearer ${enabledConfig.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBatch),
      }),
      repository,
      enabledConfig,
    );

    expect(response.status).toBe(503);
    expect(repository.envelopes.size).toBe(1);
    expect(repository.jobs.size).toBe(1);
  });

  it("collapses concurrent duplicate deliveries into one envelope and one effect", async () => {
    const repository = new MemoryIngressRepository();
    const [first, second] = await Promise.all([
      acceptDemoMessageBatch(repository, batch()),
      acceptDemoMessageBatch(repository, batch()),
    ]);

    expect(repository.envelopes.size).toBe(1);
    expect(repository.jobs.size).toBe(1);
    expect(first.duplicateCount + second.duplicateCount).toBe(1);

    const processed = await processNextIngressJob(repository, {
      workerId: "worker-one",
      leaseSeconds: 60,
    });
    expect(processed.status).toBe("succeeded");
    expect(repository.messages.size).toBe(1);
  });

  it("derives each mixed-batch tenant from its registered account", async () => {
    const repository = new MemoryIngressRepository();
    await acceptDemoMessageBatch(
      repository,
      mockMessageBatchSchema.parse({
        schemaVersion: 1,
        eventId: "mixed-provider-event",
        entries: [
          { accountExternalId: "demo-nightshift-group", messages: [message("message-a")] },
          { accountExternalId: "demo-harbour-group", messages: [message("message-b")] },
        ],
      }),
    );

    expect([...repository.envelopes.values()].map((item) => item.organizationId)).toEqual([
      "tenant-a",
      "tenant-b",
    ]);
    expect([...repository.jobs.values()].map((item) => item.organizationId)).toEqual([
      "tenant-a",
      "tenant-b",
    ]);
  });

  it("reclaims a crashed worker job after its lease expires", async () => {
    const repository = new MemoryIngressRepository();
    await acceptDemoMessageBatch(repository, batch("restart-provider-event"));
    const crashedClaim = await repository.claimJob("crashed-worker", 5);
    expect(crashedClaim?.attemptCount).toBe(1);

    repository.advance(5_001);
    const recovered = await processNextIngressJob(repository, {
      workerId: "recovery-worker",
      leaseSeconds: 60,
    });

    expect(recovered.status).toBe("succeeded");
    expect(repository.jobs.get(crashedClaim?.jobId ?? "")?.attemptCount).toBe(2);
    expect(repository.messages.size).toBe(1);
  });
});
