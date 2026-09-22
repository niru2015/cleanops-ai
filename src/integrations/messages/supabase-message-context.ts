import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEMO_ORGANIZATION_ID } from "@/services/operations-runtime";
import type { MessageResolutionInput } from "@/schemas/finance";

const uuid = z.string().uuid();
const row = async <T>(promise: PromiseLike<{ data: unknown; error: { message?: string } | null }>, schema: z.ZodType<T>) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Message records are unavailable.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Message records did not match their contract.");
  return parsed.data;
};

const contextSchema = z.object({ id: uuid, external_message_id: uuid, site_id: uuid.nullable(), zone_id: uuid.nullable(), task_run_id: uuid.nullable(), sender_worker_id: uuid.nullable(), sender_role: z.string(), resolution_status: z.string(), resolution_source: z.string().nullable(), updated_at: z.string() });
const mediaSchema = z.object({ external_message_id: uuid, id: uuid, media_kind: z.string(), mime_type: z.string().nullable(), ingestion_status: z.string(), storage_path: z.string().nullable() });
const zoneSchema = z.object({ id: uuid, name: z.string() });
const taskSchema = z.object({ id: uuid, state: z.string(), service_tasks: z.object({ name: z.string() }).nullable() });
const workerSchema = z.object({ id: uuid, display_name: z.string() });

export type MessageWorkspace = {
  zones: { id: string; name: string }[];
  tasks: { id: string; name: string; state: string }[];
  workers: { id: string; name: string }[];
  messages: { contextId: string; siteId: string; zoneId: string | null; taskRunId: string | null; senderWorkerId: string | null; senderRole: string; resolutionStatus: string; sender: string; text: string | null; occurredAt: string; media: { id: string; kind: string; mimeType: string | null; status: string; storagePath: string | null }[] }[];
};

type MessageRow = { id: string; sender_id: string; text_content: string | null; occurred_at: string };

export async function getMessageWorkspace(client: SupabaseClient, actorUserId: string, siteId: string): Promise<MessageWorkspace> {
  const [contexts, zones, tasks, workers] = await Promise.all([
    row(client.from("external_message_contexts").select("id,external_message_id,site_id,zone_id,task_run_id,sender_worker_id,sender_role,resolution_status,resolution_source,updated_at").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("updated_at", { ascending: false }).limit(25), z.array(contextSchema)),
    row(client.from("site_zones").select("id,name").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("name"), z.array(zoneSchema)),
    row(client.from("task_runs").select("id,state,service_tasks(name)").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", siteId).order("due_at"), z.array(taskSchema)),
    row(client.from("workers").select("id,display_name").eq("organization_id", DEMO_ORGANIZATION_ID).order("display_name"), z.array(workerSchema)),
  ]);
  const messageIds = contexts.map((context) => context.external_message_id);
  let messages: MessageRow[] = [];
  let media: z.infer<typeof mediaSchema>[] = [];
  if (messageIds.length) {
    const [messageResult, mediaResult] = await Promise.all([
      client.rpc("list_site_external_messages", { p_site_id: siteId, p_limit: 25, p_actor_user_id: actorUserId }),
      client.from("external_message_media").select("id,external_message_id,media_kind,mime_type,ingestion_status,storage_path").in("external_message_id", messageIds),
    ]);
    if (messageResult.error || mediaResult.error) throw new Error("Message records are unavailable.");
    const parsedMessages = z.array(z.object({ message_id: uuid, sender_id: z.string(), text_content: z.string().nullable(), occurred_at: z.string() })).safeParse(messageResult.data);
    const parsedMedia = z.array(mediaSchema).safeParse(mediaResult.data);
    if (!parsedMessages.success || !parsedMedia.success) throw new Error("Message records did not match their contract.");
    messages = parsedMessages.data.map((entry) => ({ id: entry.message_id, sender_id: entry.sender_id, text_content: entry.text_content, occurred_at: entry.occurred_at }));
    media = parsedMedia.data;
  }
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const mediaByMessage = new Map<string, typeof media>();
  for (const item of media) mediaByMessage.set(item.external_message_id, [...(mediaByMessage.get(item.external_message_id) ?? []), item]);

  return {
    zones,
    tasks: tasks.map((task) => ({ id: task.id, name: task.service_tasks?.name ?? "Service task", state: task.state })),
    workers: workers.map((worker) => ({ id: worker.id, name: worker.display_name })),
    messages: contexts.flatMap((context) => {
      const message = messageById.get(context.external_message_id);
      if (!message || !context.site_id) return [];
      return [{
        contextId: context.id, siteId: context.site_id, zoneId: context.zone_id, taskRunId: context.task_run_id, senderWorkerId: context.sender_worker_id,
        senderRole: context.sender_role, resolutionStatus: context.resolution_status, sender: message.sender_id, text: message.text_content, occurredAt: message.occurred_at,
        media: (mediaByMessage.get(message.id) ?? []).map((item) => ({ id: item.id, kind: item.media_kind, mimeType: item.mime_type, status: item.ingestion_status, storagePath: item.storage_path })),
      }];
    }),
  };
}

export async function resolveMessageContext(client: SupabaseClient, input: MessageResolutionInput) {
  const { error } = await client.from("external_message_contexts").update({
    site_id: input.siteId,
    zone_id: input.zoneId ?? null,
    task_run_id: input.taskRunId ?? null,
    sender_worker_id: input.senderWorkerId ?? null,
    sender_role: input.senderRole,
    resolution_status: "confirmed",
    resolution_source: "manual",
    confidence: 1,
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", input.contextId).eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw new Error(error.message);
}
