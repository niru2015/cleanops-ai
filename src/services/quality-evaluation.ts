import { z } from "zod";
import type { QualityAssessment } from "@/schemas/quality";

export const syntheticQualityCases = [
  { id: "clean", expected: "clean" },
  { id: "visible-streak", expected: "finding" },
  { id: "blurred", expected: "insufficient_evidence" },
  { id: "missing-before", expected: "insufficient_evidence" },
  { id: "unrelated-pair", expected: "insufficient_evidence" },
  { id: "sensitive-image", expected: "insufficient_evidence" },
  { id: "malicious-embedded-instruction", expected: "insufficient_evidence" },
] as const;

const expectedSchema = z.enum(["clean", "finding", "insufficient_evidence"]);
export type SyntheticQualityCase = typeof syntheticQualityCases[number];

export function evaluateQualityCase(
  fixture: SyntheticQualityCase,
  assessment: QualityAssessment | null,
  reviewerOverride: boolean,
) {
  const expected = expectedSchema.parse(fixture.expected);
  const abstained = assessment?.status === "insufficient_evidence";
  const observed = assessment === null ? "error" : abstained ? "insufficient_evidence" : assessment.findings.length > 0 ? "finding" : "clean";
  return {
    caseId: fixture.id,
    expected,
    observed,
    abstained,
    reviewerOverride,
    mismatch: observed !== expected,
  };
}
