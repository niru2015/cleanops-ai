"use server";

import { revalidatePath } from "next/cache";
import { SupabaseEvidenceObjectStorage, SupabaseEvidenceRepository } from "@/integrations/evidence/supabase-evidence";
import { SupabaseIngressRepository } from "@/integrations/mock-whatsapp/supabase-ingress-repository";
import {
  approveSubmission,
  confirmSuggestion,
  dismissSuggestion,
  getReviewWorkspace,
  recordQualityAssessment,
  recordQualityFailure,
  ReviewRepositoryError,
} from "@/integrations/review/supabase-review";
import { reviewActionInputSchema, type ReviewActionInput } from "@/schemas/quality";
import { acceptDemoMessageBatch } from "@/services/demo-ingress";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { ingestMockEvidence } from "@/services/evidence-media";
import { processNextIngressJob } from "@/services/ingress-worker";
import { getReviewRuntime } from "@/services/review-runtime";
import { MockVisualQualityService } from "@/services/visual-quality";

export type ReviewActionState = { ok: boolean; message: string };

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function result(ok: boolean, message: string): ReviewActionState {
  return { ok, message };
}

function failureMessage(error: unknown) {
  if (error instanceof ReviewRepositoryError) {
    if (error.code === "stale") return "This review is stale. The latest submission has been reloaded.";
    if (error.code === "denied") return "Your role cannot perform this review action.";
    if (error.code === "not_found") return "The review record is no longer available.";
  }
  return "The review action could not be completed. The submission remains available for manual review.";
}

async function submitSyntheticPair(kind: "initial" | "correction") {
  const config = getDemoIngressConfig();
  if (!config.enabled) throw new ReviewRepositoryError("denied");
  const client = (await getReviewRuntime()).writeClient;
  const ingress = new SupabaseIngressRepository(client);
  const evidence = new SupabaseEvidenceRepository(client);
  const storage = new SupabaseEvidenceObjectStorage(client);
  const correction = kind === "correction";
  const prefix = correction ? "clean-005-correction" : "golden";
  const beforeTime = correction ? "2026-09-14T06:33:00Z" : "2026-09-14T06:15:00Z";
  const afterTime = correction ? "2026-09-14T06:34:00Z" : "2026-09-14T06:29:00Z";
  const beforeMessage = correction ? `${prefix}-before-2333` : "golden-before-2315";
  const afterMessage = correction ? `${prefix}-after-2334` : "golden-after-2329";
  const beforeMedia = correction ? `${prefix}-media-before` : "golden-media-before";
  const afterMedia = correction ? `${prefix}-media-after` : "golden-media-after";

  await acceptDemoMessageBatch(ingress, {
    schemaVersion: 1,
    eventId: correction ? "clean-005-correction-replay" : "clean-004-golden-replay",
    entries: [{
      accountExternalId: "demo-nightshift-group",
      messages: [
        {
          externalMessageId: beforeMessage,
          externalThreadId: "restroom-b-thread",
          senderId: "worker-182",
          occurredAt: beforeTime,
          text: "#before Restroom B",
          mediaRefs: [{ externalId: beforeMedia, contentType: "image/png" }],
          schemaVersion: 1,
        },
        {
          externalMessageId: afterMessage,
          externalThreadId: "restroom-b-thread",
          senderId: "worker-182",
          occurredAt: afterTime,
          text: "#after Restroom B",
          mediaRefs: [{ externalId: afterMedia, contentType: "image/png" }],
          schemaVersion: 1,
        },
      ],
    }],
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const processed = await processNextIngressJob(ingress, { workerId: config.workerId, leaseSeconds: 60 });
    if (processed.status === "idle") break;
  }

  for (const item of [
    { messageId: beforeMessage, mediaId: beforeMedia },
    { messageId: afterMessage, mediaId: afterMedia },
  ]) {
    await ingestMockEvidence(evidence, storage, {
      accountExternalId: "demo-nightshift-group",
      externalMessageId: item.messageId,
      mediaExternalId: item.mediaId,
      declaredContentType: "image/png",
      contentBase64: pngBase64,
    });
  }
}

export async function performReviewAction(input: ReviewActionInput): Promise<ReviewActionState> {
  const parsed = reviewActionInputSchema.safeParse(input);
  if (!parsed.success) return result(false, "The review request was invalid.");

  try {
    const runtime = await getReviewRuntime();
    const action = parsed.data;

    if (action.action === "prepare_initial" || action.action === "submit_correction") {
      if (!runtime.demo) throw new ReviewRepositoryError("denied");
      await getReviewWorkspace(runtime.accessClient, action.taskRunId);
      await submitSyntheticPair(action.action === "prepare_initial" ? "initial" : "correction");
    } else if (action.action === "run_mock") {
      const workspace = await getReviewWorkspace(runtime.accessClient, action.taskRunId);
      if (!workspace.pair || workspace.task.submission_revision !== action.revision) {
        throw new ReviewRepositoryError("stale");
      }
      const assessment = await new MockVisualQualityService().assess({
        taskRunId: workspace.task.id,
        submissionRevision: action.revision,
        beforeEvidenceId: workspace.pair.before_evidence_id,
        afterEvidenceId: workspace.pair.after_evidence_id,
        criterionIds: ["mirror.streak_free"],
      });
      await recordQualityAssessment(runtime.writeClient, assessment);
    } else if (action.action === "simulate_failure") {
      await getReviewWorkspace(runtime.accessClient, action.taskRunId);
      await recordQualityFailure(runtime.writeClient, action.taskRunId, action.revision);
    } else if (action.action === "confirm") {
      await confirmSuggestion(runtime.demo ? runtime.writeClient : runtime.accessClient, {
        ...action,
        actorUserId: runtime.demo ? runtime.actorUserId : null,
      });
    } else if (action.action === "dismiss") {
      await dismissSuggestion(runtime.demo ? runtime.writeClient : runtime.accessClient, {
        ...action,
        actorUserId: runtime.demo ? runtime.actorUserId : null,
      });
    } else {
      await approveSubmission(runtime.demo ? runtime.writeClient : runtime.accessClient, {
        ...action,
        actorUserId: runtime.demo ? runtime.actorUserId : null,
      });
    }

    revalidatePath("/review");
    const labels: Record<ReviewActionInput["action"], string> = {
      prepare_initial: "The 23:15–23:29 synthetic submission is ready for review.",
      submit_correction: "Correction revision 2 was submitted at 23:34.",
      run_mock: "Mock AI suggestion recorded. A supervisor decision is still required.",
      simulate_failure: "Mock AI failure recorded. Manual review remains available.",
      confirm: "Finding confirmed and correction requested.",
      dismiss: "Suggestion dismissed. No finding was created.",
      approve: "Latest submission approved by the supervisor.",
    };
    return result(true, labels[action.action]);
  } catch (error) {
    revalidatePath("/review");
    return result(false, failureMessage(error));
  }
}
