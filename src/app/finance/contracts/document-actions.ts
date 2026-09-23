"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContractDetail } from "@/integrations/finance/supabase-contracts";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { contractDecisionSchema, contractUploadFinalizeSchema,
  contractUploadPrepareSchema } from "@/schemas/contract-extraction";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";
import { contractSha256, countContractPages, detectContractMime,
  extractContractDocument as proposeContractTerms } from "@/services/contract-extraction";
import { createContractUploadTicket, verifyContractUploadTicket } from "@/services/contract-upload-ticket";

const BUCKET = "contract-documents";
const documentRow = z.object({ id: z.uuid(), organization_id: z.uuid(), site_id: z.uuid(),
  contract_version_id: z.uuid(), uploaded_by: z.uuid(), status: z.string(),
  storage_path: z.string(), file_name: z.string(), declared_mime: z.string(),
  claimed_byte_size: z.number(), claimed_sha256: z.string(), sha256: z.string().nullable(),
  detected_mime: z.string().nullable(), byte_size: z.number().nullable() });

async function editableContract(contractId: string) {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  if (!["organization_administrator", "area_manager"].includes(access.role))
    throw new Error("Contract document access is restricted.");
  const detail = await getContractDetail(client, access, contractId);
  if (!isSiteAllowed(access, detail.contract.site_id) || detail.version.state !== "draft")
    throw new Error("An editable contract draft at an assigned site is required.");
  return { access, detail };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "The document operation could not be completed.";
}

export async function prepareContractDocumentUpload(input: unknown) {
  try {
    const parsed = contractUploadPrepareSchema.parse(input);
    const { access, detail } = await editableContract(parsed.contractId);
    const admin = createPrivilegedSupabaseClient();
    const scope = { organization_id: access.organizationId, site_id: detail.contract.site_id,
      contract_version_id: detail.version.id };
    const prior = await admin.from("contract_documents").select("id")
      .match({ ...scope, sha256: parsed.sha256, status: "ready" }).maybeSingle();
    if (prior.error) throw new Error("Document history could not be checked.");
    if (prior.data) return { ok: true as const, duplicateId: String(prior.data.id) };
    const documentId = randomUUID();
    const storagePath = `${access.organizationId}/${detail.contract.site_id}/${detail.version.id}/${documentId}`;
    const inserted = await admin.from("contract_documents").insert({ id: documentId, ...scope,
      file_name: parsed.fileName, declared_mime: parsed.mime,
      claimed_byte_size: parsed.byteSize, claimed_sha256: parsed.sha256,
      uploaded_by: access.userId, storage_path: storagePath });
    if (inserted.error) throw new Error("The private document record could not be prepared.");
    const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
    if (signed.error || !signed.data?.token) throw new Error("A private upload token could not be created.");
    return { ok: true as const, upload: { path: storagePath, token: signed.data.token,
      ...createContractUploadTicket(documentId, access.userId) } };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

export async function finalizeContractDocumentUpload(input: unknown) {
  try {
    const parsed = contractUploadFinalizeSchema.parse(input);
    const { access, detail } = await editableContract(parsed.contractId);
    if (!verifyContractUploadTicket(parsed, access.userId)) throw new Error("The upload token expired.");
    const admin = createPrivilegedSupabaseClient();
    const found = await admin.from("contract_documents")
      .select("id,organization_id,site_id,contract_version_id,uploaded_by,status,storage_path,file_name,declared_mime,claimed_byte_size,claimed_sha256,sha256,detected_mime,byte_size")
      .eq("id", parsed.documentId).maybeSingle();
    const row = documentRow.safeParse(found.data);
    if (found.error || !row.success || row.data.organization_id !== access.organizationId ||
      row.data.site_id !== detail.contract.site_id || row.data.contract_version_id !== detail.version.id ||
      row.data.uploaded_by !== access.userId || row.data.status !== "staged")
      throw new Error("The staged document is unavailable.");
    const downloaded = await admin.storage.from(BUCKET).download(row.data.storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("The private upload is incomplete.");
    let bytes: Uint8Array;
    let detectedMime: string;
    let pageCount: number;
    try {
      if (downloaded.data.size !== row.data.claimed_byte_size || downloaded.data.size > 15 * 1024 * 1024)
        throw new Error("Uploaded file size changed during transfer.");
      bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      const mime = detectContractMime(bytes);
      if (!mime || mime !== row.data.declared_mime || contractSha256(bytes) !== row.data.claimed_sha256)
        throw new Error("Uploaded file contents do not match the prepared document.");
      detectedMime = mime;
      pageCount = await countContractPages(bytes, mime);
    } catch (error) {
      await admin.storage.from(BUCKET).remove([row.data.storage_path]);
      await admin.from("contract_documents").update({ status: "rejected", finalized_at: new Date().toISOString() })
        .eq("id", row.data.id).eq("status", "staged");
      throw error;
    }
    const duplicate = await admin.from("contract_documents").select("id")
      .match({ organization_id: access.organizationId, site_id: detail.contract.site_id,
        contract_version_id: detail.version.id, sha256: row.data.claimed_sha256, status: "ready" }).maybeSingle();
    if (duplicate.error) throw new Error("Document history could not be checked.");
    if (duplicate.data) {
      await admin.storage.from(BUCKET).remove([row.data.storage_path]);
      const updated = await admin.from("contract_documents").update({ status: "duplicate", duplicate_of: duplicate.data.id,
        finalized_at: new Date().toISOString() }).eq("id", row.data.id).eq("status", "staged");
      if (updated.error) throw new Error("Duplicate document could not be recorded.");
      return { ok: true as const, documentId: String(duplicate.data.id), duplicate: true };
    }
    const updated = await admin.from("contract_documents").update({ status: "ready", detected_mime: detectedMime,
      byte_size: bytes.length, sha256: row.data.claimed_sha256, page_count: pageCount,
      finalized_at: new Date().toISOString() }).eq("id", row.data.id).eq("status", "staged");
    if (updated.error) throw new Error("Document verification could not be saved.");
    revalidatePath(`/finance/contracts/${parsed.contractId}/review`);
    return { ok: true as const, documentId: row.data.id, duplicate: false };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

export async function extractContractDocument(input: unknown) {
  try {
    const parsed = z.object({ contractId: z.uuid(), documentId: z.uuid() }).parse(input);
    const { access, detail } = await editableContract(parsed.contractId);
    const admin = createPrivilegedSupabaseClient();
    const found = await admin.from("contract_documents")
      .select("id,organization_id,site_id,contract_version_id,uploaded_by,status,storage_path,file_name,declared_mime,claimed_byte_size,claimed_sha256,sha256,detected_mime,byte_size")
      .eq("id", parsed.documentId).maybeSingle();
    const row = documentRow.safeParse(found.data);
    if (found.error || !row.success || row.data.organization_id !== access.organizationId ||
      row.data.site_id !== detail.contract.site_id || row.data.contract_version_id !== detail.version.id ||
      row.data.status !== "ready" || !row.data.detected_mime)
      throw new Error("The verified document is unavailable.");
    const downloaded = await admin.storage.from(BUCKET).download(row.data.storage_path);
    if (downloaded.error || !downloaded.data || downloaded.data.size > 15 * 1024 * 1024)
      throw new Error("The private document could not be read.");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (contractSha256(bytes) !== row.data.sha256) throw new Error("The document integrity check failed.");
    const scope = { organization_id: access.organizationId, site_id: detail.contract.site_id,
      contract_version_id: detail.version.id, document_id: row.data.id, created_by: access.userId };
    let runId: string | null = null;
    try {
      const { result } = await proposeContractTerms(bytes, row.data.detected_mime);
      const proposedRunId = randomUUID();
      const inserted = await admin.from("contract_extraction_runs").insert({ id: proposedRunId, ...scope,
        provider: result.provider, provider_version: result.providerVersion,
        schema_version: result.schemaVersion, status: "succeeded" });
      if (inserted.error) throw new Error("The extraction run could not be recorded.");
      runId = proposedRunId;
      const proposals = await admin.from("contract_extraction_proposals").insert(result.proposals.map((item) => ({
        organization_id: scope.organization_id, site_id: scope.site_id,
        contract_version_id: scope.contract_version_id, run_id: runId,
        field_key: item.fieldKey, category: item.category,
        proposed_value: item.proposedValue, business_state: item.businessState,
        source_page: item.source.page, source_span: item.source.span,
        source_start: item.source.start, source_end: item.source.end,
      })));
      if (proposals.error) throw new Error("The extraction proposals could not be recorded.");
    } catch (error) {
      const failure_code = error instanceof z.ZodError ? "invalid_output" : "extraction_failed";
      if (runId) await admin.from("contract_extraction_runs").update({ status: "failed", failure_code })
        .eq("id", runId);
      else await admin.from("contract_extraction_runs").insert({ ...scope,
        provider: "deterministic", provider_version: "1", schema_version: 1,
        status: "failed", failure_code });
      throw new Error("Extraction could not finish. Manual contract setup remains available.");
    }
    revalidatePath(`/finance/contracts/${parsed.contractId}/review`);
    return { ok: true as const, message: "Proposed terms are ready for human review." };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

export async function recordContractExtractionDecision(input: unknown) {
  try {
    const parsed = contractDecisionSchema.parse(input);
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!["organization_administrator", "area_manager", "operations_manager"].includes(access.role))
      throw new Error("Contract review access is restricted.");
    const detail = await getContractDetail(client, access, parsed.contractId);
    if (detail.version.state !== "draft" || !isSiteAllowed(access, detail.contract.site_id))
      throw new Error("An editable contract draft is required.");
    const proposal = await client.from("contract_extraction_proposals")
      .select("contract_version_id").eq("id", parsed.proposalId)
      .eq("organization_id", access.organizationId).eq("site_id", detail.contract.site_id).maybeSingle();
    if (proposal.error || proposal.data?.contract_version_id !== detail.version.id)
      throw new Error("The proposal is unavailable for this draft.");
    const decision = await client.rpc("review_contract_extraction_proposal", {
      p_proposal_id: parsed.proposalId, p_decision: parsed.decision,
      p_reviewed_value: parsed.reviewedValue ? JSON.parse(parsed.reviewedValue) : null,
      p_reason: parsed.reason || null });
    if (decision.error) throw new Error(decision.error.message);
    revalidatePath(`/finance/contracts/${detail.contract.id}/review`);
    return { ok: true as const, message: "Review decision recorded." };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}
