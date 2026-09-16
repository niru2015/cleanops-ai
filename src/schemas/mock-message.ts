import { z } from "zod";

const identifier = z.string().trim().min(1).max(255);

export const mockMediaReferenceSchema = z
  .object({
    externalId: identifier,
    contentType: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const mockMessageSchema = z
  .object({
    externalMessageId: identifier,
    externalThreadId: identifier,
    senderId: identifier,
    occurredAt: z.string().datetime({ offset: true }),
    text: z.string().max(8000).optional(),
    mediaRefs: z.array(mockMediaReferenceSchema).max(10).default([]),
    schemaVersion: z.literal(1).default(1),
  })
  .strict()
  .refine((message) => Boolean(message.text?.trim()) || message.mediaRefs.length > 0, {
    message: "A message must contain text or at least one media reference.",
  });

export const mockAccountEntrySchema = z
  .object({
    accountExternalId: z.string().trim().min(1).max(160),
    messages: z.array(mockMessageSchema).min(1).max(100),
  })
  .strict();

export const mockMessageBatchSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: identifier.optional(),
    entries: z.array(mockAccountEntrySchema).min(1).max(20),
  })
  .strict()
  .superRefine((batch, context) => {
    const accounts = new Set<string>();

    batch.entries.forEach((entry, index) => {
      if (accounts.has(entry.accountExternalId)) {
        context.addIssue({
          code: "custom",
          message: "Each account may appear only once per batch.",
          path: ["entries", index, "accountExternalId"],
        });
      }
      accounts.add(entry.accountExternalId);
    });
  });

export const storedMockEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    providerEventId: identifier.nullable(),
    accountExternalId: z.string().trim().min(1).max(160),
    messages: z.array(mockMessageSchema).min(1).max(100),
  })
  .strict();

export const workerCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("process"),
      workerId: z.string().trim().min(1).max(120).optional(),
      leaseSeconds: z.number().int().min(5).max(3600).default(60),
    })
    .strict(),
  z
    .object({
      action: z.literal("retry"),
      jobId: z.string().uuid(),
    })
    .strict(),
]);

export type MockMessage = z.infer<typeof mockMessageSchema>;
export type MockAccountEntry = z.infer<typeof mockAccountEntrySchema>;
export type MockMessageBatch = z.infer<typeof mockMessageBatchSchema>;
export type WorkerCommand = z.infer<typeof workerCommandSchema>;
