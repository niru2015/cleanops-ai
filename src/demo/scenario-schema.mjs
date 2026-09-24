import { z } from "zod";

const date = z.iso.date();
const modules = z.object({
  base: z.literal(true),
  contracts: z.boolean().default(false),
  expenses: z.boolean().default(false),
  time: z.boolean().default(false),
  projects: z.boolean().default(false),
  reconciliation: z.boolean().default(false),
  supplies: z.boolean().default(false),
  equipment: z.boolean().default(false),
}).strict();

export const scenarioSchema = z.object({
  schemaVersion: z.literal(1),
  scenarioId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  seed: z.number().int().nonnegative().max(0xffffffff),
  generatorVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
  clock: z.object({ start: date, end: date, timezone: z.string().min(3) }).strict(),
  organization: z.object({ name: z.string().min(2).max(120), siteCount: z.number().int().min(1).max(20), workerCount: z.number().int().min(1).max(300) }).strict(),
  referencePack: z.enum(["fictional-v1", "tornado-v1"]),
  modules,
  cases: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(50),
}).strict().superRefine((value, context) => {
  if (value.clock.end < value.clock.start) context.addIssue({ code: "custom", path: ["clock", "end"], message: "end must follow start" });
  if (value.modules.contracts && value.generatorVersion < 2) context.addIssue({ code: "custom", path: ["generatorVersion"], message: "contracts require generatorVersion 2 or later" });
  if (value.modules.expenses && value.generatorVersion < 3) context.addIssue({ code: "custom", path: ["generatorVersion"], message: "expenses require generatorVersion 3 or later" });
  if (value.modules.time && value.generatorVersion < 4) context.addIssue({ code: "custom", path: ["generatorVersion"], message: "time requires generatorVersion 4 or later" });
  if (value.modules.projects && (value.generatorVersion < 5 || !value.modules.time || !value.modules.expenses)) context.addIssue({ code: "custom", path: ["modules", "projects"], message: "projects require generatorVersion 5 with time and expenses" });
  if (value.modules.reconciliation && (value.generatorVersion < 6 || !value.modules.projects)) context.addIssue({ code: "custom", path: ["modules", "reconciliation"], message: "reconciliation requires generatorVersion 6 with projects" });
  for (const [key, enabled] of Object.entries(value.modules)) {
    if (key !== "base" && key !== "contracts" && key !== "expenses" && key !== "time" && key !== "projects" && key !== "reconciliation" && enabled) context.addIssue({ code: "custom", path: ["modules", key], message: `${key} adapter is not implemented` });
  }
});

export const referenceSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["fictional", "reference-only"]),
  disclaimer: z.string().optional(),
  city: z.string().min(2),
  siteNames: z.array(z.string().min(2)).min(1),
  workerNames: z.array(z.string().min(2)),
  equipmentNames: z.array(z.string().min(2)),
  personas: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9-]*$/),
    displayName: z.string().min(2),
    role: z.enum(["organization_administrator", "area_manager", "operations_manager", "site_supervisor", "cleaner", "client_viewer"]),
    siteIndex: z.number().int().nonnegative().optional(),
    minGeneratorVersion: z.number().int().min(1).max(8).optional(),
  }).strict()).min(1),
}).strict().superRefine((value, context) => {
  if (new Set(value.personas.map((persona) => persona.key)).size !== value.personas.length) context.addIssue({ code: "custom", path: ["personas"], message: "persona keys must be unique" });
});

export function parseScenario(value) {
  const result = scenarioSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid scenario: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  return result.data;
}

export function parseReference(value) {
  const result = referenceSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid reference pack: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  return result.data;
}
