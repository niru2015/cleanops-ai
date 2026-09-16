export type EvidenceProcessingStatus = "staged" | "ready" | "quarantined" | "missing";
export type EvidenceLinkageStatus = "unresolved" | "linked" | "ignored";
export type EvidenceRole = "before" | "after";

export type BeginEvidenceInput = {
  externalAccountId: string;
  externalMessageId: string;
  mediaExternalId: string;
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
};

export type StagedEvidence = {
  evidenceId: string;
  storagePath: string;
  processingStatus: EvidenceProcessingStatus;
  linkageStatus: EvidenceLinkageStatus;
  duplicate: boolean;
};

export type EvidenceResolution = {
  evidenceId: string;
  processingStatus: EvidenceProcessingStatus;
  linkageStatus: EvidenceLinkageStatus;
  resolutionCode: string | null;
  taskRunId: string | null;
  submissionRevision: number | null;
  role: EvidenceRole | null;
  pairId: string | null;
};

export type PendingEvidence = {
  evidenceId: string;
  storagePath: string;
  sha256: string | null;
  contentType: string | null;
  byteSize: number | null;
};

export interface EvidenceRepository {
  begin(input: BeginEvidenceInput): Promise<StagedEvidence>;
  markProblem(
    evidenceId: string,
    status: "quarantined" | "missing",
    errorCode: string,
  ): Promise<boolean>;
  finalize(
    evidenceId: string,
    sha256: string,
    contentType: string,
    byteSize: number,
  ): Promise<EvidenceResolution>;
  listStaged(limit: number): Promise<PendingEvidence[]>;
}

export interface EvidenceObjectStorage {
  upload(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<"uploaded" | "exists">;
  download(path: string): Promise<Uint8Array | null>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

export class EvidenceRepositoryError extends Error {
  constructor(
    readonly code:
      | "source_not_found"
      | "identity_conflict"
      | "database_unavailable"
      | "invalid_database_response"
      | "storage_unavailable",
  ) {
    super(code);
    this.name = "EvidenceRepositoryError";
  }
}
