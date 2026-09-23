import { z } from "zod";

export const expenseCategory = z.enum(["meals","fuel_travel","supplies","equipment_purchase",
  "equipment_repair","parking_tolls","contractor","other_direct"]);
export const expensePaymentMethod = z.enum(["employee_personal","company_card","company_cash",
  "supplier_invoice","other"]);
const money = z.number().finite().min(0).max(100_000_000);
export const financeSuggestion = z.object({
  category: expenseCategory.nullable(), vendor: z.string().max(200).nullable(),
  expenseDate: z.iso.date().nullable(), subtotal: money.nullable(), tax: money.nullable(),
  total: money.positive().nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  paymentMethod: expensePaymentMethod.nullable(), siteHint: z.string().max(180).nullable(),
  projectReference: z.string().max(180).nullable(), sourceSpan: z.string().max(500).nullable(),
}).strict();
export const expenseResolution = z.object({
  intakeId: z.uuid(), siteId: z.uuid(), category: expenseCategory,
  vendor: z.string().trim().min(1).max(200), expenseDate: z.iso.date(),
  paymentMethod: expensePaymentMethod, currency: z.string().regex(/^[A-Z]{3}$/),
  subtotal: money.nullable(), tax: money.nullable(), total: money.positive(),
  description: z.string().trim().min(1).max(500), contractId: z.uuid().nullable(),
  projectReference: z.string().max(180).nullable(), reason: z.string().max(500).nullable(),
  allocations: z.array(z.object({ siteId: z.uuid(), amount: money.positive(),
    projectReference: z.string().max(180).nullable() })).min(1).max(20).nullable(),
}).strict().refine((value) => value.subtotal == null || value.tax == null ||
  Math.abs(value.subtotal + value.tax - value.total) <= 0.01,
  { message: "Subtotal, tax and total do not reconcile." });
