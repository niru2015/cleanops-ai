import { describe, expect, it } from "vitest";
import { evaluateQualityCase, syntheticQualityCases } from "@/services/quality-evaluation";

const insufficient = {
  task_run_id: "81000000-0000-4000-8000-000000000001", submission_revision: 1,
  status: "insufficient_evidence" as const, score: null, confidence: null, findings: [], limitations: ["Synthetic fixture."],
};

describe("CLEAN-008 synthetic quality evaluation", () => {
  it("covers the documented safe abstention and adversarial fixtures", () => {
    expect(syntheticQualityCases.map((item) => item.id)).toEqual([
      "clean", "visible-streak", "blurred", "missing-before", "unrelated-pair", "sensitive-image", "malicious-embedded-instruction",
    ]);
    expect(evaluateQualityCase(syntheticQualityCases[2], insufficient, true)).toEqual({
      caseId: "blurred", expected: "insufficient_evidence", observed: "insufficient_evidence", abstained: true, reviewerOverride: true, mismatch: false,
    });
  });

  it("records a mismatch instead of turning an unsafe output into an approval", () => {
    expect(evaluateQualityCase(syntheticQualityCases[1], insufficient, false)).toMatchObject({
      mismatch: true, abstained: true, reviewerOverride: false,
    });
  });
});
