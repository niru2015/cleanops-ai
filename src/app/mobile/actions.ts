"use server";

import { revalidatePath } from "next/cache";
import { SupabaseEvidenceObjectStorage, SupabaseEvidenceRepository } from "@/integrations/evidence/supabase-evidence";
import { SupabaseIngressRepository } from "@/integrations/mock-whatsapp/supabase-ingress-repository";
import { getMobileWorkspace, selectMobileZone } from "@/integrations/operations/supabase-operations";
import { mobileActionSchema, type MobileActionInput } from "@/schemas/operations";
import { acceptDemoMessageBatch } from "@/services/demo-ingress";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { ingestMockEvidence } from "@/services/evidence-media";
import { processNextIngressJob } from "@/services/ingress-worker";
import { getOperationsRuntime } from "@/services/operations-runtime";

export type MobileActionState = { ok: boolean; message: string };
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function captureSyntheticEvidence(role: "before" | "after") {
  const config = getDemoIngressConfig();
  const runtime = await getOperationsRuntime("cleaner");
  if (!runtime.demo) throw new Error("Synthetic capture is disabled.");
  const ingress = new SupabaseIngressRepository(runtime.writeClient);
  const evidence = new SupabaseEvidenceRepository(runtime.writeClient);
  const storage = new SupabaseEvidenceObjectStorage(runtime.writeClient);
  const suffix = role === "before" ? "2315" : "2329";
  const occurredAt = role === "before" ? "2026-09-14T06:15:00Z" : "2026-09-14T06:29:00Z";
  const externalMessageId = `clean-006-mobile-${role}-${suffix}`;
  const mediaExternalId = `clean-006-mobile-media-${role}`;

  await acceptDemoMessageBatch(ingress, {
    schemaVersion: 1,
    eventId: `clean-006-mobile-${role}-event`,
    entries: [{
      accountExternalId: "demo-nightshift-group",
      messages: [{ externalMessageId, externalThreadId: "cleanops-mobile-demo", senderId: "worker-182", occurredAt, text: `#${role} Slot Bank 14`, mediaRefs: [{ externalId: mediaExternalId, contentType: "image/png" }], schemaVersion: 1 }],
    }],
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const processed = await processNextIngressJob(ingress, { workerId: config.workerId, leaseSeconds: 60 });
    if (processed.status === "idle") break;
  }
  await ingestMockEvidence(evidence, storage, { accountExternalId: "demo-nightshift-group", externalMessageId, mediaExternalId, declaredContentType: "image/png", contentBase64: pngBase64 });
}

export async function performMobileAction(input: MobileActionInput): Promise<MobileActionState> {
  const parsed = mobileActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The mobile request was invalid." };
  try {
    const runtime = await getOperationsRuntime("cleaner");
    await getMobileWorkspace(runtime.accessClient, parsed.data.taskRunId);
    if (parsed.data.action === "select_zone") {
      await selectMobileZone(runtime.demo ? runtime.writeClient : runtime.accessClient, parsed.data.taskRunId);
      revalidatePath("/mobile");
      return { ok: true, message: "Slot Bank 14 selected. QR sets task context; it does not record attendance or prove identity." };
    }
    if (parsed.data.simulateFailure) return { ok: false, message: "Upload failed before recording. Your task is unchanged; retry when ready." };
    await captureSyntheticEvidence(parsed.data.role);
    revalidatePath("/mobile");
    revalidatePath("/operations");
    return { ok: true, message: `${parsed.data.role === "before" ? "Before" : "After"} photo uploaded and linked to this task.` };
  } catch {
    revalidatePath("/mobile");
    return { ok: false, message: "The mobile action could not be saved. Check access and try again." };
  }
}
