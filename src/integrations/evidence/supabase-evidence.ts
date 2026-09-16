import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import type { EvidenceResolutionRequest } from "@/schemas/evidence";
import {
  EvidenceRepositoryError,
  type BeginEvidenceInput,
  type EvidenceLinkageStatus,
  type EvidenceObjectStorage,
  type EvidenceProcessingStatus,
  type EvidenceRepository,
  type EvidenceResolution,
  type EvidenceRole,
  type PendingEvidence,
  type StagedEvidence,
} from "@/services/evidence-repository";

const EVIDENCE_BUCKET = "operational-evidence";
type Row = Record<string, unknown>;

function firstRow(data: unknown): Row | null {
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") return null;
  return data[0] as Row;
}

function isProcessingStatus(value: unknown): value is EvidenceProcessingStatus {
  return ["staged", "ready", "quarantined", "missing"].includes(String(value));
}

function isLinkageStatus(value: unknown): value is EvidenceLinkageStatus {
  return ["unresolved", "linked", "ignored"].includes(String(value));
}

function isRole(value: unknown): value is EvidenceRole | null {
  return value === null || value === "before" || value === "after";
}

function repositoryError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (
    message.includes("not_found") ||
    message.includes("media_reference_not_found")
  ) {
    return new EvidenceRepositoryError("source_not_found");
  }
  if (message.includes("media_identity_conflict")) {
    return new EvidenceRepositoryError("identity_conflict");
  }
  return new EvidenceRepositoryError("database_unavailable");
}

function stagedFromRow(row: Row | null): StagedEvidence {
  if (
    !row ||
    typeof row.evidence_id !== "string" ||
    typeof row.storage_path !== "string" ||
    !isProcessingStatus(row.processing_status) ||
    !isLinkageStatus(row.linkage_status) ||
    typeof row.duplicate !== "boolean"
  ) {
    throw new EvidenceRepositoryError("invalid_database_response");
  }
  return {
    evidenceId: row.evidence_id,
    storagePath: row.storage_path,
    processingStatus: row.processing_status,
    linkageStatus: row.linkage_status,
    duplicate: row.duplicate,
  };
}

function resolutionFromRow(row: Row | null): EvidenceResolution {
  if (
    !row ||
    typeof row.evidence_id !== "string" ||
    !isProcessingStatus(row.processing_status) ||
    !isLinkageStatus(row.linkage_status) ||
    !(row.resolution_code === null || typeof row.resolution_code === "string") ||
    !(row.task_run_id === null || typeof row.task_run_id === "string") ||
    !(row.submission_revision === null || typeof row.submission_revision === "number") ||
    !isRole(row.role) ||
    !(row.pair_id === null || typeof row.pair_id === "string")
  ) {
    throw new EvidenceRepositoryError("invalid_database_response");
  }
  return {
    evidenceId: row.evidence_id,
    processingStatus: row.processing_status,
    linkageStatus: row.linkage_status,
    resolutionCode: row.resolution_code,
    taskRunId: row.task_run_id,
    submissionRevision: row.submission_revision,
    role: row.role,
    pairId: row.pair_id,
  };
}

export class SupabaseEvidenceRepository implements EvidenceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async begin(input: BeginEvidenceInput) {
    const { data, error } = await this.client.rpc("begin_evidence_ingestion", {
      p_external_account_id: input.externalAccountId,
      p_external_message_id: input.externalMessageId,
      p_media_external_id: input.mediaExternalId,
      p_content_type: input.contentType,
      p_byte_size: input.byteSize,
      p_sha256: input.sha256,
    });
    if (error) throw repositoryError(error);
    return stagedFromRow(firstRow(data));
  }

  async markProblem(
    evidenceId: string,
    status: "quarantined" | "missing",
    errorCode: string,
  ) {
    const { data, error } = await this.client.rpc("mark_evidence_ingestion_problem", {
      p_evidence_id: evidenceId,
      p_status: status,
      p_error_code: errorCode,
    });
    if (error) throw repositoryError(error);
    if (typeof data !== "boolean") {
      throw new EvidenceRepositoryError("invalid_database_response");
    }
    return data;
  }

  async finalize(
    evidenceId: string,
    sha256: string,
    contentType: string,
    byteSize: number,
  ) {
    const { data, error } = await this.client.rpc("finalize_evidence_ingestion", {
      p_evidence_id: evidenceId,
      p_sha256: sha256,
      p_content_type: contentType,
      p_byte_size: byteSize,
    });
    if (error) throw repositoryError(error);
    return resolutionFromRow(firstRow(data));
  }

  async listStaged(limit: number) {
    const { data, error } = await this.client.rpc("list_staged_evidence", {
      p_limit: limit,
    });
    if (error) throw repositoryError(error);
    if (!Array.isArray(data)) {
      throw new EvidenceRepositoryError("invalid_database_response");
    }
    return data.map((item) => {
      const row = item as Row;
      if (
        typeof row.evidence_id !== "string" ||
        typeof row.storage_path !== "string" ||
        !(row.sha256 === null || typeof row.sha256 === "string") ||
        !(row.content_type === null || typeof row.content_type === "string") ||
        !(row.byte_size === null || typeof row.byte_size === "number")
      ) {
        throw new EvidenceRepositoryError("invalid_database_response");
      }
      return {
        evidenceId: row.evidence_id,
        storagePath: row.storage_path,
        sha256: row.sha256,
        contentType: row.content_type,
        byteSize: row.byte_size,
      } satisfies PendingEvidence;
    });
  }
}

export class SupabaseEvidenceObjectStorage implements EvidenceObjectStorage {
  constructor(private readonly client: SupabaseClient) {}

  async upload(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.client.storage.from(EVIDENCE_BUCKET).upload(path, bytes, {
      cacheControl: "0",
      contentType,
      upsert: false,
    });
    if (!error) return "uploaded" as const;
    if (/already exists|duplicate/i.test(error.message)) return "exists" as const;
    throw new EvidenceRepositoryError("storage_unavailable");
  }

  async download(path: string) {
    const { data, error } = await this.client.storage.from(EVIDENCE_BUCKET).download(path);
    if (error) {
      if (/not found|does not exist/i.test(error.message)) return null;
      throw new EvidenceRepositoryError("storage_unavailable");
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async createSignedUrl(path: string, expiresInSeconds: number) {
    const { data, error } = await this.client.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new EvidenceRepositoryError("storage_unavailable");
    }
    return data.signedUrl;
  }
}

export function createSupabaseEvidenceDependencies() {
  const client = createPrivilegedSupabaseClient();
  return {
    repository: new SupabaseEvidenceRepository(client),
    storage: new SupabaseEvidenceObjectStorage(client),
  };
}

export async function getAuthorizedEvidencePath(
  client: SupabaseClient,
  evidenceId: string,
) {
  const { data, error } = await client
    .from("task_evidence")
    .select("storage_path, processing_status")
    .eq("id", evidenceId)
    .eq("processing_status", "ready")
    .maybeSingle();
  if (error || !data || typeof data.storage_path !== "string") return null;
  return data.storage_path;
}

export async function applyEvidenceResolution(
  client: SupabaseClient,
  evidenceId: string,
  request: EvidenceResolutionRequest,
) {
  if (request.action === "ignore") {
    const { data, error } = await client.rpc("ignore_evidence", {
      p_evidence_id: evidenceId,
      p_reason_code: request.reasonCode,
    });
    return {
      applied: error === null && data === true,
      error: error ? (error.code === "42501" ? "denied" : "unavailable") : null,
    } as const;
  }

  const { data, error } = await client.rpc("resolve_evidence_manually", {
    p_evidence_id: evidenceId,
    p_worker_id: request.workerId,
    p_task_run_id: request.taskRunId,
    p_role: request.role,
    p_reason_code: request.reasonCode,
    p_before_evidence_id: request.beforeEvidenceId,
  });
  return {
    applied: error === null && data === true,
    error: error ? (error.code === "42501" ? "denied" : "unavailable") : null,
  } as const;
}
