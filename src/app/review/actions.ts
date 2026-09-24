"use server";

import { revalidatePath } from "next/cache";
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
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { prepareHostedReviewFixture, prepareLocalReviewFixture } from "@/services/hosted-demo-fixture";
import { getReviewRuntime } from "@/services/review-runtime";
import { MockVisualQualityService } from "@/services/visual-quality";

export type ReviewActionState = { ok: boolean; message: string };

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

export async function performReviewAction(input: ReviewActionInput): Promise<ReviewActionState> {
  const parsed = reviewActionInputSchema.safeParse(input);
  if (!parsed.success) return result(false, "The review request was invalid.");

  try {
    const runtime = await getReviewRuntime();
    const action = parsed.data;

    if (action.action === "prepare_initial" || action.action === "submit_correction") {
      if (!runtime.demo) throw new ReviewRepositoryError("denied");
      await getReviewWorkspace(runtime.accessClient, action.taskRunId);
      if (getDemoIngressConfig().enabled) {
        await prepareLocalReviewFixture(action.action, runtime.writeClient);
      } else if (runtime.actorUserId) {
        await prepareHostedReviewFixture(runtime.accessClient, runtime.writeClient,
          runtime.actorUserId, action.action, action.taskRunId);
      } else throw new ReviewRepositoryError("denied");
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
