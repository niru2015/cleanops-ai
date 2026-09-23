import { z } from "zod";

export const contractIdentitySchema = z.object({
  siteId: z.string().uuid(),
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(160),
});

export const contractDatesSchema = z.object({
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.iso.date(), z.literal("")]),
  renewalNotes: z.string().max(2000),
  referenceNotes: z.string().max(2000),
}).refine((value) => !value.effectiveTo || value.effectiveTo > value.effectiveFrom,
  "Expiry must follow the effective date.");

export const contractTermSchema = z.object({
  basis: z.enum(["fixed_monthly", "fixed_annual", "hourly", "per_shift", "project_fixed", "custom"]),
  amount: z.union([z.literal(""), z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/)]),
  currency: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal("")]),
  description: z.string().max(2000),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.iso.date(), z.literal("")]),
}).refine((value) => (value.amount === "") === (value.currency === ""),
  "Amount and currency must be provided together.")
  .refine((value) => value.basis === "custom" || value.amount !== "",
    "A priced billing model requires an amount.")
  .refine((value) => !value.effectiveTo || value.effectiveTo > value.effectiveFrom,
    "Term expiry must follow its effective date.");

export const contractStaffingSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  localStart: z.string().regex(/^\d{2}:\d{2}$/),
  localEnd: z.string().regex(/^\d{2}:\d{2}$/),
  requiredPositions: z.coerce.number().int().min(1).max(10000),
}).refine((value) => value.localEnd > value.localStart,
  "Shift end must follow its start.");

export const contractObligationSchema = z.object({
  zoneId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  recurrence: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]),
  dueWindowMinutes: z.coerce.number().int().min(1).max(525600),
  evidenceRequired: z.boolean(),
  inspectionRequired: z.boolean(),
});

export const contractSlaSchema = z.object({
  name: z.string().trim().min(2).max(160),
  numeratorRule: z.string().trim().min(2).max(500),
  denominatorRule: z.string().trim().min(2).max(500),
  exclusionRule: z.string().trim().min(2).max(500),
});

export const contractResponsibilitiesSchema = z.object({
  supply: z.enum(["included", "reimbursable", "client_provided", "mixed", "unknown"]),
  equipment: z.enum(["included", "reimbursable", "client_provided", "mixed", "unknown"]),
  repair: z.enum(["included", "reimbursable", "client_provided", "mixed", "unknown"]),
});
