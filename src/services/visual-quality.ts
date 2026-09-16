import { qualityAssessmentSchema, type QualityAssessment } from "@/schemas/quality";

export type VisualQualityInput = {
  taskRunId: string;
  submissionRevision: number;
  beforeEvidenceId: string;
  afterEvidenceId: string;
  criterionIds: string[];
  /** Present only after the server has created approved redacted derivatives. */
  redactedDerivatives?: {
    role: "before" | "after";
    dataUrl: string;
    byteSize: number;
  }[];
};

export interface VisualQualityService {
  assess(input: VisualQualityInput): Promise<QualityAssessment>;
}

export class MockVisualQualityService implements VisualQualityService {
  async assess(input: VisualQualityInput): Promise<QualityAssessment> {
    const corrected = input.submissionRevision > 1;
    return qualityAssessmentSchema.parse({
      task_run_id: input.taskRunId,
      submission_revision: input.submissionRevision,
      status: "assessed",
      score: corrected ? 96 : 86,
      confidence: corrected ? 0.94 : 0.82,
      findings: corrected
        ? []
        : [
            {
              criterion_id: "mirror.streak_free",
              observation: "Possible streak remains on the lower-right mirror surface.",
              severity: "medium",
              evidence_ids: [input.afterEvidenceId],
            },
          ],
      limitations: ["Synthetic demonstration result; no live vision model was called."],
    });
  }
}
