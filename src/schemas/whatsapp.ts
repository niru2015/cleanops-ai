import { z } from "zod";

const mediaSchema = z.object({ id: z.string().min(1).max(255), mime_type: z.string().max(120).optional() }).passthrough();
const messageSchema = z.object({
  id: z.string().min(1).max(255),
  from: z.string().min(1).max(64),
  timestamp: z.string().regex(/^\d{1,20}$/),
  type: z.string().min(1).max(40),
  text: z.object({ body: z.string().max(8000) }).passthrough().optional(),
  image: mediaSchema.optional(),
  document: mediaSchema.optional(),
  video: mediaSchema.optional(),
  audio: mediaSchema.optional(),
  sticker: mediaSchema.optional(),
}).passthrough();

export const whatsappStatusSchema = z.object({
  id: z.string().min(1).max(255),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string().regex(/^\d{1,20}$/),
  recipient_id: z.string().min(1).max(64).optional(),
  errors: z.array(z.object({ code: z.number().int(), title: z.string().optional() }).passthrough()).optional(),
}).passthrough();

const valueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: z.object({ phone_number_id: z.string().min(1).max(160) }).passthrough(),
  messages: z.array(messageSchema).max(100).optional(),
  statuses: z.array(whatsappStatusSchema).max(100).optional(),
}).passthrough();

export const whatsappWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: z.string().min(1).max(160),
    changes: z.array(z.object({ field: z.literal("messages"), value: valueSchema }).passthrough()).max(100),
  }).passthrough()).min(1).max(20),
}).passthrough();

export const outboundMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(4096) }).strict(),
  z.object({
    type: z.literal("template"),
    templateName: z.string().regex(/^[a-z0-9_]{1,512}$/),
    languageCode: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
  }).strict(),
]);

export type WhatsAppWebhook = z.infer<typeof whatsappWebhookSchema>;
export type WhatsAppStatus = z.infer<typeof whatsappStatusSchema>;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;
