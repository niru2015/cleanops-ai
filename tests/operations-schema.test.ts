import { describe, expect, it } from "vitest";
import {
  mobileActionSchema,
  mobilePhotoFinalizeSchema,
  mobilePhotoPrepareSchema,
  operationsActionSchema,
} from "@/schemas/operations";

describe("operations input contracts", () => {
  it("accepts bounded staffing and mobile actions", () => {
    expect(operationsActionSchema.safeParse({ action: "select_replacement", workerId: "60000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(mobileActionSchema.safeParse({ action: "select_zone", taskRunId: "81000000-0000-4000-8000-000000000004" }).success).toBe(true);
    expect(mobilePhotoPrepareSchema.safeParse({ taskRunId: "81000000-0000-4000-8000-000000000004", role: "before", contentType: "image/jpeg", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(true);
    expect(mobilePhotoFinalizeSchema.safeParse({ evidenceId: "81000000-0000-4000-8000-000000000004", expiresAt: 1_800_000_000_000, signature: "b".repeat(64) }).success).toBe(true);
  });

  it("rejects unknown fields and invalid evidence roles", () => {
    expect(operationsActionSchema.safeParse({ action: "select_replacement", workerId: "bad", autoDispatch: true }).success).toBe(false);
    expect(mobileActionSchema.safeParse({ action: "select_zone", taskRunId: "bad", autoCapture: true }).success).toBe(false);
    expect(mobilePhotoPrepareSchema.safeParse({ taskRunId: "81000000-0000-4000-8000-000000000004", role: "during", contentType: "image/heic", byteSize: 10 * 1024 * 1024 + 1, sha256: "bad" }).success).toBe(false);
  });
});
