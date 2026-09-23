import { describe, expect, it } from "vitest";
import { contractDatesSchema, contractStaffingSchema, contractTermSchema } from "@/schemas/contracts";

describe("manual contract boundaries", () => {
  it("keeps an incomplete draft but rejects invalid effective ranges", () => {
    expect(contractDatesSchema.safeParse({ effectiveFrom: "2026-10-01", effectiveTo: "",
      renewalNotes: "", referenceNotes: "" }).success).toBe(true);
    expect(contractDatesSchema.safeParse({ effectiveFrom: "2026-10-01", effectiveTo: "2026-09-01",
      renewalNotes: "", referenceNotes: "" }).success).toBe(false);
  });

  it("requires an explicit amount and currency for priced models", () => {
    const base = { basis: "fixed_monthly", amount: "", currency: "",
      description: "", effectiveFrom: "2026-10-01", effectiveTo: "" };
    expect(contractTermSchema.safeParse(base).success).toBe(false);
    expect(contractTermSchema.safeParse({ ...base, basis: "custom", description: "Price unresolved" }).success).toBe(true);
    expect(contractTermSchema.safeParse({ ...base, amount: "12.34", currency: "CAD" }).success).toBe(true);
    expect(contractTermSchema.safeParse({ ...base, amount: "12.34", currency: "cad" }).success).toBe(false);
  });

  it("does not accept a staffing window with no positive duration", () => {
    expect(contractStaffingSchema.safeParse({ weekday: "1", localStart: "16:00",
      localEnd: "08:00", requiredPositions: "2" }).success).toBe(false);
  });
});
