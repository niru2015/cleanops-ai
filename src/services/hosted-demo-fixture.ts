import "server-only";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SupabaseEvidenceObjectStorage, SupabaseEvidenceRepository } from "@/integrations/evidence/supabase-evidence";
import { SupabaseIngressRepository } from "@/integrations/mock-whatsapp/supabase-ingress-repository";
import { ReviewRepositoryError, getReviewWorkspace } from "@/integrations/review/supabase-review";
import { storedMockEnvelopeSchema } from "@/schemas/mock-message";
import { acceptDemoMessageBatch } from "@/services/demo-ingress";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { ingestEvidenceBytes } from "@/services/evidence-media";
import { processNextIngressJob } from "@/services/ingress-worker";
import { HOSTED_DEMO_ORGANIZATION_ID, HOSTED_DEMO_SITE_ID, isHostedDemoEnabled } from "@/services/hosted-demo";
import { DEMO_REVIEW_TASK_ID } from "@/services/review-runtime";

export type HostedFixtureAction = "prepare_initial" | "submit_correction" | "reset";
const operationSchema = z.object({ operation_id: z.uuid() });
const claimSchema = z.array(z.object({ job_id: z.uuid(), payload: z.unknown() }));

export async function withHostedFixtureLease<T>(
  client: SupabaseClient,
  actorUserId: string,
  action: HostedFixtureAction,
  run: () => Promise<T>,
  isSuccess: (result: T) => boolean = () => true,
): Promise<T> {
  const { data, error } = await client.rpc("begin_hosted_demo_fixture_operation", {
    p_actor_user_id: actorUserId,
    p_site_id: HOSTED_DEMO_SITE_ID,
    p_action: action,
  });
  const operation = operationSchema.safeParse(data);
  if (error?.message?.includes("demo_fixture_busy")) throw new ReviewRepositoryError("stale");
  if (error?.message?.includes("demo_fixture_denied")) throw new ReviewRepositoryError("denied");
  if (error || !operation.success) throw new ReviewRepositoryError("unavailable");

  let succeeded = false;
  try {
    const result = await run();
    succeeded = isSuccess(result);
    return result;
  } finally {
    const finished = await client.rpc("finish_hosted_demo_fixture_operation", {
      p_operation_id: operation.data.operation_id,
      p_succeeded: succeeded,
    });
    if (finished.error || finished.data !== true) throw new ReviewRepositoryError("unavailable");
  }
}

const fixtures = {
  prepare_initial: {
    eventId: "clean-004-golden-replay",
    beforeTime: "2026-09-14T06:15:00Z", afterTime: "2026-09-14T06:29:00Z",
    beforeMessage: "golden-before-2315", afterMessage: "golden-after-2329",
    beforeMedia: "golden-media-before", afterMedia: "golden-media-after",
  },
  submit_correction: {
    eventId: "clean-005-correction-replay",
    beforeTime: "2026-09-14T06:33:00Z", afterTime: "2026-09-14T06:34:00Z",
    beforeMessage: "clean-005-correction-before-2333", afterMessage: "clean-005-correction-after-2334",
    beforeMedia: "clean-005-correction-media-before", afterMedia: "clean-005-correction-media-after",
  },
} as const;

async function syntheticImage(role: "before" | "after", correction: boolean) {
  const title = `${correction ? "CORRECTED " : ""}${role.toUpperCase()} · SYNTHETIC`;
  const colour = role === "before" ? "#AB835A" : "#348F91";
  const svg = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="480" fill="#e7ebe8"/><rect x="75" y="65" width="490" height="350" rx="14" fill="${colour}"/><rect x="105" y="95" width="430" height="290" rx="8" fill="#f2f7f4"/><path d="M110 180h420M110 255h420M110 330h420" stroke="${colour}" stroke-width="12" opacity=".45"/><rect x="0" y="405" width="640" height="75" fill="#071f30"/><text x="25" y="450" fill="white" font-size="25" font-family="sans-serif">${title}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function prepareHostedReviewFixture(
  accessClient: SupabaseClient,
  writeClient: SupabaseClient,
  actorUserId: string,
  action: "prepare_initial" | "submit_correction",
  taskRunId: string,
) {
  if (!isHostedDemoEnabled() || taskRunId !== DEMO_REVIEW_TASK_ID) throw new ReviewRepositoryError("denied");
  const workspace = await getReviewWorkspace(accessClient, taskRunId);
  if (workspace.task.organization_id !== HOSTED_DEMO_ORGANIZATION_ID || workspace.task.site_id !== HOSTED_DEMO_SITE_ID) {
    throw new ReviewRepositoryError("denied");
  }
  if (action === "prepare_initial" && workspace.pair) return;
  if (action === "prepare_initial" && workspace.task.state !== "ready") throw new ReviewRepositoryError("stale");
  if (action === "submit_correction" && workspace.task.state !== "correction_required") throw new ReviewRepositoryError("stale");

  await withHostedFixtureLease(writeClient, actorUserId, action, async () => {
    const current = await getReviewWorkspace(accessClient, taskRunId);
    if (action === "prepare_initial" && current.pair) return;
    if (current.task.state !== (action === "prepare_initial" ? "ready" : "correction_required")) {
      throw new ReviewRepositoryError("stale");
    }
    const fixture = fixtures[action];
    const ingress = new SupabaseIngressRepository(writeClient);
    const evidence = new SupabaseEvidenceRepository(writeClient);
    const storage = new SupabaseEvidenceObjectStorage(writeClient);
    const accepted = await acceptDemoMessageBatch(ingress, {
      schemaVersion: 1,
      eventId: fixture.eventId,
      entries: [{ accountExternalId: "demo-nightshift-group", messages: [
        { externalMessageId: fixture.beforeMessage, externalThreadId: "restroom-b-thread", senderId: "worker-182", occurredAt: fixture.beforeTime, text: "#before Restroom B", mediaRefs: [{ externalId: fixture.beforeMedia, contentType: "image/png" }], schemaVersion: 1 },
        { externalMessageId: fixture.afterMessage, externalThreadId: "restroom-b-thread", senderId: "worker-182", occurredAt: fixture.afterTime, text: "#after Restroom B", mediaRefs: [{ externalId: fixture.afterMedia, contentType: "image/png" }], schemaVersion: 1 },
      ] }],
    });
    const workerId = getDemoIngressConfig().workerId;
    const claimed = await writeClient.rpc("claim_hosted_demo_fixture_job", {
      p_job_id: accepted.envelopes[0].jobId,
      p_worker_id: workerId,
    });
    const parsedClaim = claimSchema.safeParse(claimed.data);
    if (claimed.error || !parsedClaim.success) throw new ReviewRepositoryError("unavailable");
    if (parsedClaim.data[0]) {
      const payload = storedMockEnvelopeSchema.safeParse(parsedClaim.data[0].payload);
      if (!payload.success) throw new ReviewRepositoryError("unavailable");
      await ingress.completeJob(parsedClaim.data[0].job_id, workerId, payload.data.messages);
    }
    for (const [role, messageId, mediaId] of [
      ["before", fixture.beforeMessage, fixture.beforeMedia],
      ["after", fixture.afterMessage, fixture.afterMedia],
    ] as const) {
      const result = await ingestEvidenceBytes(evidence, storage, {
        accountExternalId: "demo-nightshift-group", externalMessageId: messageId,
        mediaExternalId: mediaId, declaredContentType: "image/png",
      }, await syntheticImage(role, action === "submit_correction"));
      if (result.processingStatus !== "ready" || result.linkageStatus !== "linked") {
        throw new ReviewRepositoryError("unavailable");
      }
    }
    const completed = await getReviewWorkspace(accessClient, taskRunId);
    if (!completed.pair || completed.task.submission_revision !== current.task.submission_revision + 1) {
      throw new ReviewRepositoryError("unavailable");
    }
  });
}

// The local browser fixture still uses the token-gated simulator and its own worker.
export async function prepareLocalReviewFixture(action: "prepare_initial" | "submit_correction", writeClient: SupabaseClient) {
  const config = getDemoIngressConfig();
  if (!config.enabled) throw new ReviewRepositoryError("denied");
  const fixture = fixtures[action];
  const ingress = new SupabaseIngressRepository(writeClient);
  const evidence = new SupabaseEvidenceRepository(writeClient);
  const storage = new SupabaseEvidenceObjectStorage(writeClient);
  await acceptDemoMessageBatch(ingress, { schemaVersion: 1, eventId: fixture.eventId, entries: [{
    accountExternalId: "demo-nightshift-group", messages: [
      { externalMessageId: fixture.beforeMessage, externalThreadId: "restroom-b-thread", senderId: "worker-182", occurredAt: fixture.beforeTime, text: "#before Restroom B", mediaRefs: [{ externalId: fixture.beforeMedia, contentType: "image/png" }], schemaVersion: 1 },
      { externalMessageId: fixture.afterMessage, externalThreadId: "restroom-b-thread", senderId: "worker-182", occurredAt: fixture.afterTime, text: "#after Restroom B", mediaRefs: [{ externalId: fixture.afterMedia, contentType: "image/png" }], schemaVersion: 1 },
    ],
  }] });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await processNextIngressJob(ingress, { workerId: config.workerId, leaseSeconds: 60 })).status === "idle") break;
  }
  for (const [role, messageId, mediaId] of [
    ["before", fixture.beforeMessage, fixture.beforeMedia], ["after", fixture.afterMessage, fixture.afterMedia],
  ] as const) {
    await ingestEvidenceBytes(evidence, storage, {
      accountExternalId: "demo-nightshift-group", externalMessageId: messageId,
      mediaExternalId: mediaId, declaredContentType: "image/png",
    }, await syntheticImage(role, action === "submit_correction"));
  }
}
