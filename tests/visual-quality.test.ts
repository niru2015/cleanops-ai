import { describe, expect, it } from "vitest";
import { qualityAssessmentSchema, qualityProviderOutputSchema } from "@/schemas/quality";
import { MockVisualQualityService } from "@/services/visual-quality";

const input = {
  taskRunId: "81000000-0000-4000-8000-000000000001",
  submissionRevision: 1,
  beforeEvidenceId: "e2000000-0000-4000-8000-000000000001",
  afterEvidenceId: "e2000000-0000-4000-8000-000000000002",
  criterionIds: ["mirror.streak_free"],
};

describe("CLEAN-005 Mock VisualQualityService", () => {
  it("returns the revision-one score and an advisory streak observation", async () => {
    const result = await new MockVisualQualityService().assess(input);

    expect(result.score).toBe(86);
    expect(result.findings).toEqual([
      expect.objectContaining({ criterion_id: "mirror.streak_free", severity: "medium" }),
    ]);
    expect(result.limitations[0]).toContain("Synthetic");
  });

  it("returns score 96 without a finding for the corrected revision", async () => {
    const result = await new MockVisualQualityService().assess({ ...input, submissionRevision: 2 });

    expect(result.score).toBe(96);
    expect(result.findings).toEqual([]);
  });

  it("rejects malformed or contradictory quality output", () => {
    expect(() => qualityAssessmentSchema.parse({
      task_run_id: input.taskRunId,
      submission_revision: 1,
      status: "insufficient_evidence",
      score: 86,
      confidence: 2,
      findings: [],
      limitations: [],
      unexpected: true,
    })).toThrow();
  });

  it("does not permit a provider to select arbitrary evidence IDs", () => {
    expect(() => qualityProviderOutputSchema.parse({
      status: "assessed", score: 80, confidence: 0.7, limitations: [],
      findings: [{ criterion_id: "mirror.streak_free", observation: "Possible streak.", severity: "low", evidence_role: "after", evidence_ids: [input.afterEvidenceId] }],
    })).toThrow();
  });
});
