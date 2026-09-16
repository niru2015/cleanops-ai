import { describe, expect, it } from "vitest";
import { mobileActionSchema, operationsActionSchema } from "@/schemas/operations";

describe("operations input contracts", () => {
  it("accepts bounded staffing and mobile actions", () => {
    expect(operationsActionSchema.safeParse({ action: "select_replacement", workerId: "60000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(mobileActionSchema.safeParse({ action: "capture", taskRunId: "81000000-0000-4000-8000-000000000004", role: "before", simulateFailure: true }).success).toBe(true);
  });

  it("rejects unknown fields and invalid evidence roles", () => {
    expect(operationsActionSchema.safeParse({ action: "select_replacement", workerId: "bad", autoDispatch: true }).success).toBe(false);
    expect(mobileActionSchema.safeParse({ action: "capture", taskRunId: "81000000-0000-4000-8000-000000000004", role: "during", simulateFailure: false }).success).toBe(false);
  });
});
