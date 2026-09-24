import { describe, expect, it } from "vitest";
import {
  mobileActionSchema,
  mobilePhotoFinalizeSchema,
  mobilePhotoPrepareSchema,
  operationsActionSchema,
} from "@/schemas/operations";
import { financeActionSchema, messageResolutionSchema } from "@/schemas/finance";

describe("operations input contracts", () => {
  it("accepts bounded staffing and mobile actions", () => {
    expect(operationsActionSchema.safeParse({ action: "select_replacement", workerId: "60000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(mobileActionSchema.safeParse({ action: "select_zone", taskRunId: "81000000-0000-4000-8000-000000000004" }).success).toBe(true);
    expect(mobilePhotoPrepareSchema.safeParse({ taskRunId: "81000000-0000-4000-8000-000000000004", role: "before", contentType: "image/jpeg", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(true);
    expect(mobilePhotoFinalizeSchema.safeParse({ taskRunId: "81000000-0000-4000-8000-000000000004", evidenceId: "81000000-0000-4000-8000-000000000004", expiresAt: 1_800_000_000_000, signature: "b".repeat(64) }).success).toBe(true);
  });

  it("rejects unknown fields and invalid evidence roles", () => {
    expect(operationsActionSchema.safeParse({ action: "select_replacement", workerId: "bad", autoDispatch: true }).success).toBe(false);
    expect(mobileActionSchema.safeParse({ action: "select_zone", taskRunId: "bad", autoCapture: true }).success).toBe(false);
    expect(mobilePhotoPrepareSchema.safeParse({ taskRunId: "81000000-0000-4000-8000-000000000004", role: "during", contentType: "image/heic", byteSize: 10 * 1024 * 1024 + 1, sha256: "bad" }).success).toBe(false);
  });

  it("accepts bounded finance capture and supervisor message resolution", () => {
    expect(financeActionSchema.safeParse({ action: "record_inventory", siteId: "40000000-0000-4000-8000-000000000001", inventoryItemId: "60000000-0000-4000-8000-000000000001", transactionType: "receipt", quantity: 2, unitCost: 7.5, occurredAt: "2026-09-21T02:00:00.000Z" }).success).toBe(true);
    expect(financeActionSchema.safeParse({ action: "record_labour", siteId: "40000000-0000-4000-8000-000000000001", workDate: "2026-09-21", hours: 2, hourlyCost: 24.5, costType: "regular", notes: "Imported contractor adjustment" }).success).toBe(true);
    expect(financeActionSchema.safeParse({ action: "record_labour", siteId: "40000000-0000-4000-8000-000000000001", workDate: "2026-09-21", hours: 2, hourlyCost: 24.5, costType: "regular" }).success).toBe(false);
    expect(messageResolutionSchema.safeParse({ contextId: "60000000-0000-4000-8000-000000000001", siteId: "40000000-0000-4000-8000-000000000001", senderRole: "supervisor" }).success).toBe(true);
    expect(financeActionSchema.safeParse({ action: "record_inventory", siteId: "40000000-0000-4000-8000-000000000001", inventoryItemId: "bad", transactionType: "receipt", quantity: -1, unitCost: 7.5, occurredAt: "not-a-date", extra: true }).success).toBe(false);
  });

  it("accepts bounded finance ledger edits and deletes", () => {
    expect(financeActionSchema.safeParse({ action: "update_inventory", id: "60000000-0000-4000-8000-000000000001", siteId: "40000000-0000-4000-8000-000000000001", inventoryItemId: "60000000-0000-4000-8000-000000000001", transactionType: "adjustment", quantity: 4, unitCost: 7.5, occurredAt: "2026-09-21T02:00:00.000Z" }).success).toBe(true);
    expect(financeActionSchema.safeParse({ action: "delete_inventory", id: "60000000-0000-4000-8000-000000000001", siteId: "40000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(financeActionSchema.safeParse({ action: "update_labour", id: "60000000-0000-4000-8000-000000000001", siteId: "40000000-0000-4000-8000-000000000001", workDate: "2026-09-21", hours: 3, hourlyCost: 24.5, costType: "overtime" }).success).toBe(true);
    expect(financeActionSchema.safeParse({ action: "delete_labour", id: "60000000-0000-4000-8000-000000000001", siteId: "40000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(financeActionSchema.safeParse({ action: "update_inventory", id: "bad", siteId: "40000000-0000-4000-8000-000000000001", inventoryItemId: "60000000-0000-4000-8000-000000000001", transactionType: "adjustment", quantity: 4, unitCost: 7.5, occurredAt: "2026-09-21T02:00:00.000Z" }).success).toBe(false);
    expect(financeActionSchema.safeParse({ action: "delete_inventory", id: "60000000-0000-4000-8000-000000000001", siteId: "40000000-0000-4000-8000-000000000001", quantity: 5 }).success).toBe(false);
  });
});
