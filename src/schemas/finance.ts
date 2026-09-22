import { z } from "zod";

const uuid = z.string().uuid();
const money = z.number().finite().min(0).max(1_000_000);
const siteId = uuid;

export const financeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_vendor"),
    siteId,
    name: z.string().trim().min(1).max(200),
    vendorCode: z.string().trim().min(1).max(80).optional(),
    contactReference: z.string().trim().min(1).max(200).optional(),
  }).strict(),
  z.object({
    action: z.literal("create_inventory_item"),
    siteId,
    sku: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100).optional(),
    unitOfMeasure: z.string().trim().min(1).max(40),
    reorderLevel: z.number().finite().min(0).max(1_000_000),
  }).strict(),
  z.object({
    action: z.literal("record_inventory"),
    siteId,
    vendorId: uuid.optional(),
    inventoryItemId: uuid,
    transactionType: z.enum(["receipt", "issue", "adjustment", "count"]),
    quantity: z.number().finite().positive().max(1_000_000),
    unitCost: money,
    occurredAt: z.string().datetime({ offset: true }),
    notes: z.string().trim().min(1).max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("record_labour"),
    siteId,
    workerId: uuid.optional(),
    taskRunId: uuid.optional(),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hours: z.number().finite().positive().max(24),
    hourlyCost: money,
    costType: z.enum(["regular", "overtime", "contractor"]),
    notes: z.string().trim().min(1).max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("update_inventory"),
    id: uuid,
    siteId,
    vendorId: uuid.optional(),
    inventoryItemId: uuid,
    transactionType: z.enum(["receipt", "issue", "adjustment", "count"]),
    quantity: z.number().finite().positive().max(1_000_000),
    unitCost: money,
    occurredAt: z.string().datetime({ offset: true }),
    notes: z.string().trim().min(1).max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("delete_inventory"),
    id: uuid,
    siteId,
  }).strict(),
  z.object({
    action: z.literal("update_labour"),
    id: uuid,
    siteId,
    workerId: uuid.optional(),
    taskRunId: uuid.optional(),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hours: z.number().finite().positive().max(24),
    hourlyCost: money,
    costType: z.enum(["regular", "overtime", "contractor"]),
    notes: z.string().trim().min(1).max(1_000).optional(),
  }).strict(),
  z.object({
    action: z.literal("delete_labour"),
    id: uuid,
    siteId,
  }).strict(),
]);

export const messageResolutionSchema = z.object({
  contextId: uuid,
  siteId: uuid,
  zoneId: uuid.optional(),
  taskRunId: uuid.optional(),
  senderWorkerId: uuid.optional(),
  senderRole: z.enum(["supervisor", "manager", "cleaner", "system", "unknown"]),
}).strict();

export type FinanceActionInput = z.infer<typeof financeActionSchema>;
export type MessageResolutionInput = z.infer<typeof messageResolutionSchema>;
