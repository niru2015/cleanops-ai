import { z } from "zod";

export const contractDocumentMimeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/webp",
]);
export const contractUploadPrepareSchema = z.object({
  contractId: z.uuid(),
  fileName: z.string().trim().min(1).max(180),
  mime: contractDocumentMimeSchema,
  byteSize: z.number().int().min(1).max(15 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const contractUploadFinalizeSchema = z.object({
  contractId: z.uuid(), documentId: z.uuid(), expiresAt: z.number().int(),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

const date = z.iso.date();
const financialTerm = z.strictObject({ basis: z.enum(["fixed_monthly","fixed_annual","hourly","per_shift","project_fixed","custom"]),
  amount: z.number().finite().nonnegative().max(999999999999.99), currency: z.enum(["CAD","USD"]),
  description: z.string().max(500).optional() });
const staffing = z.strictObject({ weekday: z.number().int().min(0).max(6),
  localStart: z.string().regex(/^\d{2}:\d{2}$/), localEnd: z.string().regex(/^\d{2}:\d{2}$/),
  requiredPositions: z.number().int().min(1).max(10000) });
const obligation = z.strictObject({ name: z.string().trim().min(2).max(160),
  recurrence: z.enum(["daily","weekly","monthly","quarterly","annual"]),
  zoneId: z.uuid().nullable().optional() });
const sla = z.strictObject({ name: z.string().min(2).max(160), numeratorRule: z.string().min(2).max(500),
  denominatorRule: z.string().min(2).max(500), exclusionRule: z.string().min(2).max(500) });
const responsibility = z.enum(["included","reimbursable","client_provided","mixed","unknown"]);
const source = z.object({
  page: z.number().int().min(1).max(20).nullable(),
  span: z.string().min(1).max(500).nullable(),
  start: z.number().int().nonnegative().nullable(),
  end: z.number().int().nonnegative().nullable(),
});
export const contractProposalSchema = z.object({
  fieldKey: z.enum(["contract_name", "effective_from", "effective_to", "financial_term",
    "payment_terms", "staffing", "obligation", "sla_term", "reporting_term",
    "supply_responsibility", "equipment_responsibility", "repair_responsibility",
    "additional_work"]),
  category: z.enum(["identity", "commercial", "operational"]),
  businessState: z.enum(["clear", "review_recommended", "not_found"]),
  proposedValue: z.unknown().nullable(),
  source,
}).superRefine((value, context) => {
  if (value.businessState === "clear" && (!value.source.page || !value.source.span || value.proposedValue == null))
    context.addIssue({ code: "custom", message: "Clear proposals require value and page/span." });
  if (value.fieldKey === "effective_from" || value.fieldKey === "effective_to") {
    if (value.proposedValue !== null && !date.safeParse(value.proposedValue).success)
      context.addIssue({ code: "custom", message: "Invalid proposed date." });
  }
  if (value.proposedValue === null) return;
  const expected = value.fieldKey === "financial_term" ? financialTerm
    : value.fieldKey === "staffing" ? staffing
      : value.fieldKey === "obligation" ? obligation
        : value.fieldKey === "sla_term" ? z.union([z.string().min(2).max(500), sla])
          : value.fieldKey.endsWith("_responsibility") ? responsibility
            : z.string().min(2).max(500);
  if (!expected.safeParse(value.proposedValue).success)
    context.addIssue({ code: "custom", message: `Invalid proposed ${value.fieldKey} value.` });
});
export const contractExtractionResultSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.string().min(1).max(80),
  providerVersion: z.string().min(1).max(40),
  proposals: z.array(contractProposalSchema).max(100),
});
export type ContractProposal = z.infer<typeof contractProposalSchema>;
export type ContractExtractionResult = z.infer<typeof contractExtractionResultSchema>;

export const contractDecisionSchema = z.object({
  contractId: z.uuid(), proposalId: z.uuid(),
  decision: z.enum(["accept", "edit", "reject", "unknown"]),
  reviewedValue: z.string().max(2000).optional(),
  reason: z.string().trim().max(500).optional(),
});
