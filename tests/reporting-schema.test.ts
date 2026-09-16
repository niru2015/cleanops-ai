import { describe, expect, it } from "vitest";
import { incidentActionSchema, reportActionSchema } from "@/schemas/reporting";

describe("CLEAN-007 reporting action contracts", () => {
  it("accepts only bounded incident and equipment demo actions", () => {
    expect(incidentActionSchema.safeParse({ action: "record_incident" }).success).toBe(true);
    expect(incidentActionSchema.safeParse({ action: "record_equipment" }).success).toBe(true);
    expect(incidentActionSchema.safeParse({ action: "correct_incident", incidentId: "not-an-id" }).success).toBe(false);
    expect(incidentActionSchema.safeParse({ action: "resolve_equipment" }).success).toBe(false);
  });

  it("requires a report id for explicit release", () => {
    expect(reportActionSchema.safeParse({ action: "prepare_report" }).success).toBe(true);
    expect(reportActionSchema.safeParse({ action: "release_report" }).success).toBe(false);
    expect(reportActionSchema.safeParse({ action: "release_report", reportId: "d4000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });
});
