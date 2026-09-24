"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  SupabaseEvidenceObjectStorage,
  SupabaseEvidenceRepository,
} from "@/integrations/evidence/supabase-evidence";
import { SupabaseIngressRepository } from "@/integrations/mock-whatsapp/supabase-ingress-repository";
import {
  getMobileWorkspace,
  selectMobileZone,
} from "@/integrations/operations/supabase-operations";
import {
  mobileActionSchema,
  mobilePhotoFinalizeSchema,
  mobilePhotoPrepareSchema,
  type MobileActionInput,
  type MobilePhotoFinalizeInput,
  type MobilePhotoPrepareInput,
} from "@/schemas/operations";
import { acceptDemoMessageBatch } from "@/services/demo-ingress";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { ingestEvidenceBytes } from "@/services/evidence-media";
import { processNextIngressJob } from "@/services/ingress-worker";
import {
  createMobileUploadTicket,
  verifyMobileUploadTicket,
} from "@/services/mobile-upload-ticket";
import {
  DEMO_MOBILE_TASK_ID,
  DEMO_ORGANIZATION_ID,
  DEMO_SITE_ID,
  getOperationsRuntime,
  type OperationsRuntime,
} from "@/services/operations-runtime";

const EVIDENCE_BUCKET = "operational-evidence";
const MOBILE_ACCOUNT_EXTERNAL_ID = "demo-nightshift-group";
const MOBILE_INTEGRATION_ACCOUNT_ID = "c0000000-0000-4000-8000-000000000001";
const MOBILE_SENDER_ID = "worker-182";
const RESTROOM_TASK_ID = "81000000-0000-4000-8000-000000000001";

function captureContext(taskRunId: string) {
  if (taskRunId === RESTROOM_TASK_ID) return { threadId: "restroom-b-thread", label: "Restroom B" };
  if (taskRunId === DEMO_MOBILE_TASK_ID) return { threadId: "cleanops-mobile-demo", label: "Slot Bank 14" };
  throw new Error("This task is not in the synthetic capture walkthrough.");
}

const evidenceRowSchema = z.object({
  id: z.string().uuid(),
  external_message_id: z.string().uuid(),
  media_external_id: z.string().min(1),
  storage_path: z.string().min(1),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byte_size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  processing_status: z.literal("staged"),
  submitted_by_user_id: z.string().uuid(),
});

const sourceMessageSchema = z.object({
  external_message_id: z.string().min(1),
  external_thread_id: z.string(),
  sender_id: z.literal(MOBILE_SENDER_ID),
  text_content: z.string(),
  media_refs: z.array(z.object({
    externalId: z.string().min(1),
    contentType: z.string().optional(),
  })),
});

export type MobileActionState = { ok: boolean; message: string };

export type MobilePhotoPrepareState = MobileActionState & {
  upload?: {
    path: string;
    token: string;
    evidenceId: string;
    expiresAt: number;
    signature: string;
  };
};

function expectedCaptureRole(workspace: Awaited<ReturnType<typeof getMobileWorkspace>>) {
  if (workspace.state === "correction_required") return workspace.beforeReady && !workspace.afterReady ? "after" : null;
  if ((workspace.state !== "ready" && workspace.state !== "in_progress") || workspace.afterReady) return null;
  return workspace.beforeReady ? "after" : "before";
}

async function authorizedCaptureWorkspace(runtime: OperationsRuntime, taskRunId: string) {
  captureContext(taskRunId);
  const workspace = await getMobileWorkspace(runtime.accessClient, taskRunId);
  const { data, error } = await runtime.writeClient.from("task_run_assignments")
    .select("id").eq("organization_id", DEMO_ORGANIZATION_ID).eq("site_id", DEMO_SITE_ID)
    .eq("task_run_id", taskRunId).eq("worker_id", "60000000-0000-4000-8000-000000000001")
    .limit(1);
  if (error || !data?.length) throw new Error("This task is not assigned to the demo worker.");
  return workspace;
}

async function ensureNormalizedMessage(
  runtime: OperationsRuntime,
  externalMessageId: string,
) {
  const ingress = new SupabaseIngressRepository(runtime.writeClient);
  const config = getDemoIngressConfig();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await runtime.writeClient
      .from("external_messages")
      .select("id")
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .eq("integration_account_id", MOBILE_INTEGRATION_ACCOUNT_ID)
      .eq("external_message_id", externalMessageId)
      .maybeSingle();
    if (error) throw new Error("The photo record could not be checked.");
    if (data) return;

    const processed = await processNextIngressJob(ingress, {
      workerId: config.workerId,
      leaseSeconds: 60,
    });
    if (processed.status === "idle") break;
  }

  throw new Error("The photo record could not be prepared.");
}

export async function performMobileAction(
  input: MobileActionInput,
): Promise<MobileActionState> {
  const parsed = mobileActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The mobile request was invalid." };

  try {
    const runtime = await getOperationsRuntime("capture");
    await authorizedCaptureWorkspace(runtime, parsed.data.taskRunId);
    await selectMobileZone(
      runtime.demo ? runtime.writeClient : runtime.accessClient,
      parsed.data.taskRunId,
    );
    revalidatePath("/mobile");
    return {
      ok: true,
      message: "Slot Bank 14 selected. QR sets task context; it does not record attendance or prove identity.",
    };
  } catch {
    revalidatePath("/mobile");
    return { ok: false, message: "The mobile action could not be saved. Check access and try again." };
  }
}

export async function prepareMobilePhotoUpload(
  input: MobilePhotoPrepareInput,
): Promise<MobilePhotoPrepareState> {
  const parsed = mobilePhotoPrepareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Choose a JPEG, PNG, or WebP image up to 10 MB." };
  }

  try {
    const runtime = await getOperationsRuntime("capture");
    if (!runtime.demo) throw new Error("Mobile demo upload is unavailable.");

    const workspace = await authorizedCaptureWorkspace(runtime, parsed.data.taskRunId);
    const context = captureContext(parsed.data.taskRunId);
    if (!workspace.contextSelected) throw new Error("Select the work area first.");
    if (expectedCaptureRole(workspace) !== parsed.data.role) {
      throw new Error("Refresh the task before uploading this photo.");
    }

    const uniqueId = randomUUID();
    const externalMessageId = `cleanops-mobile-${parsed.data.role}-${uniqueId}`;
    const mediaExternalId = `cleanops-mobile-media-${uniqueId}`;
    const occurredAt = parsed.data.role === "before" ? "2026-09-14T06:15:00Z"
      : workspace.state === "correction_required" ? "2026-09-14T06:34:00Z" : "2026-09-14T06:29:00Z";
    const ingress = new SupabaseIngressRepository(runtime.writeClient);

    await acceptDemoMessageBatch(ingress, {
      schemaVersion: 1,
      eventId: `cleanops-mobile-upload-${uniqueId}`,
      entries: [{
        accountExternalId: MOBILE_ACCOUNT_EXTERNAL_ID,
        messages: [{
          externalMessageId,
          externalThreadId: context.threadId,
          senderId: MOBILE_SENDER_ID,
          occurredAt,
          text: `#${parsed.data.role} ${context.label}`,
          mediaRefs: [{
            externalId: mediaExternalId,
            contentType: parsed.data.contentType,
          }],
          schemaVersion: 1,
        }],
      }],
    });
    await ensureNormalizedMessage(runtime, externalMessageId);

    const repository = new SupabaseEvidenceRepository(runtime.writeClient);
    const staged = await repository.begin({
      externalAccountId: MOBILE_ACCOUNT_EXTERNAL_ID,
      externalMessageId,
      mediaExternalId,
      contentType: parsed.data.contentType,
      byteSize: parsed.data.byteSize,
      sha256: parsed.data.sha256,
    });
    if (staged.processingStatus !== "staged") {
      throw new Error("This photo has already been processed.");
    }
    const provenance = await runtime.writeClient.from("task_evidence")
      .update({ submitted_by_user_id: runtime.actorUserId })
      .eq("id", staged.evidenceId).eq("organization_id", DEMO_ORGANIZATION_ID)
      .eq("processing_status", "staged");
    if (provenance.error) throw new Error("The upload actor could not be recorded.");

    const { data, error } = await runtime.writeClient.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUploadUrl(staged.storagePath, { upsert: false });
    if (error || !data?.token) throw new Error("A private upload could not be prepared.");

    return {
      ok: true,
      message: "Private upload prepared.",
      upload: {
        path: staged.storagePath,
        token: data.token,
        ...createMobileUploadTicket(staged.evidenceId, runtime.actorUserId),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The photo upload could not be prepared.",
    };
  }
}

export async function finalizeMobilePhotoUpload(
  input: MobilePhotoFinalizeInput,
): Promise<MobileActionState> {
  const parsed = mobilePhotoFinalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The upload confirmation was invalid." };

  try {
    const runtime = await getOperationsRuntime("capture");
    if (!runtime.demo) throw new Error("Mobile demo upload is unavailable.");
    if (!verifyMobileUploadTicket(parsed.data, runtime.actorUserId)) {
      throw new Error("The upload expired. Choose the photo again.");
    }
    const workspace = await authorizedCaptureWorkspace(runtime, parsed.data.taskRunId);
    const context = captureContext(parsed.data.taskRunId);
    if (expectedCaptureRole(workspace) === null) throw new Error("This task is no longer accepting photos.");

    const evidenceResult = await runtime.writeClient
      .from("task_evidence")
      .select("id,external_message_id,media_external_id,storage_path,content_type,byte_size,sha256,processing_status,submitted_by_user_id")
      .eq("id", parsed.data.evidenceId)
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .eq("site_id", DEMO_SITE_ID)
      .eq("integration_account_id", MOBILE_INTEGRATION_ACCOUNT_ID)
      .maybeSingle();
    const evidence = evidenceRowSchema.safeParse(evidenceResult.data);
    if (evidenceResult.error || !evidence.success) {
      throw new Error("The staged upload could not be found.");
    }
    if (evidence.data.submitted_by_user_id !== runtime.actorUserId) throw new Error("The upload belongs to another user.");

    const sourceResult = await runtime.writeClient
      .from("external_messages")
      .select("external_message_id,external_thread_id,sender_id,text_content,media_refs")
      .eq("id", evidence.data.external_message_id)
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .eq("integration_account_id", MOBILE_INTEGRATION_ACCOUNT_ID)
      .maybeSingle();
    const source = sourceMessageSchema.safeParse(sourceResult.data);
    if (sourceResult.error || !source.success) {
      throw new Error("The upload source could not be verified.");
    }
    if (source.data.external_thread_id !== context.threadId
      || source.data.text_content !== `#${expectedCaptureRole(workspace)} ${context.label}`) {
      throw new Error("The upload does not belong to this task or revision.");
    }
    const media = source.data.media_refs.find(
      (item) => item.externalId === evidence.data.media_external_id,
    );
    if (!media || media.contentType !== evidence.data.content_type) {
      throw new Error("The upload source did not match the staged photo.");
    }

    const storage = new SupabaseEvidenceObjectStorage(runtime.writeClient);
    const bytes = await storage.download(evidence.data.storage_path);
    if (!bytes) throw new Error("The photo did not finish uploading. Try again.");

    const resolution = await ingestEvidenceBytes(
      new SupabaseEvidenceRepository(runtime.writeClient),
      storage,
      {
        accountExternalId: MOBILE_ACCOUNT_EXTERNAL_ID,
        externalMessageId: source.data.external_message_id,
        mediaExternalId: evidence.data.media_external_id,
        declaredContentType: evidence.data.content_type,
      },
      bytes,
    );
    if (resolution.processingStatus !== "ready") {
      throw new Error("The file was rejected because its contents did not match a supported image.");
    }

    revalidatePath("/mobile");
    revalidatePath("/operations");
    revalidatePath("/review");
    const label = source.data.text_content.startsWith("#after") ? "After" : "Before";
    return resolution.linkageStatus === "linked"
      ? { ok: true, message: `${label} photo uploaded and linked to this task.` }
      : { ok: true, message: `${label} photo uploaded privately. A supervisor must resolve its task link.` };
  } catch (error) {
    revalidatePath("/mobile");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The photo could not be verified. Try again.",
    };
  }
}
