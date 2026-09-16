import { createHash } from "node:crypto";
import type { MockEvidenceRequest } from "@/schemas/evidence";
import type {
  EvidenceObjectStorage,
  EvidenceRepository,
  EvidenceResolution,
  PendingEvidence,
} from "@/services/evidence-repository";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export type EvidenceMediaSource = {
  accountExternalId: string;
  externalMessageId: string;
  mediaExternalId: string;
  declaredContentType: string | null;
};

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeBase64(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    return null;
  }
  const bytes = Buffer.from(compact, "base64");
  return bytes.length > 0 ? new Uint8Array(bytes) : null;
}

export function detectImageContentType(bytes: Uint8Array) {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a &&
    Buffer.from(bytes.subarray(12, 16)).toString("ascii") === "IHDR"
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(
      Buffer.from(bytes.subarray(12, 16)).toString("ascii"),
    )
  ) {
    return "image/webp";
  }
  return null;
}

async function visibleProblem(
  repository: EvidenceRepository,
  request: EvidenceMediaSource,
  bytes: Uint8Array | null,
  status: "quarantined" | "missing",
  errorCode: string,
) {
  const contentType = bytes ? detectImageContentType(bytes) : null;
  const staged = await repository.begin({
    externalAccountId: request.accountExternalId,
    externalMessageId: request.externalMessageId,
    mediaExternalId: request.mediaExternalId,
    contentType,
    byteSize:
      bytes && bytes.byteLength <= MAX_MEDIA_BYTES ? bytes.byteLength : null,
    sha256: bytes ? digest(bytes) : null,
  });
  if (staged.processingStatus === "staged") {
    await repository.markProblem(staged.evidenceId, status, errorCode);
  }
  return {
    evidenceId: staged.evidenceId,
    processingStatus: status,
    linkageStatus: "unresolved" as const,
    resolutionCode: errorCode,
    duplicate: staged.duplicate,
  };
}

export async function recordEvidenceMediaProblem(
  repository: EvidenceRepository,
  request: EvidenceMediaSource,
  status: "quarantined" | "missing",
  errorCode: string,
) {
  return visibleProblem(repository, request, null, status, errorCode);
}

export async function ingestEvidenceBytes(
  repository: EvidenceRepository,
  storage: EvidenceObjectStorage,
  request: EvidenceMediaSource,
  bytes: Uint8Array,
) {
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    return visibleProblem(repository, request, bytes, "quarantined", "media_too_large");
  }

  const detectedContentType = detectImageContentType(bytes);
  if (!detectedContentType) {
    return visibleProblem(repository, request, bytes, "quarantined", "media_unsafe");
  }
  if (
    request.declaredContentType !== null &&
    request.declaredContentType !== detectedContentType
  ) {
    return visibleProblem(repository, request, bytes, "quarantined", "media_type_mismatch");
  }

  const sha256 = digest(bytes);
  const staged = await repository.begin({
    externalAccountId: request.accountExternalId,
    externalMessageId: request.externalMessageId,
    mediaExternalId: request.mediaExternalId,
    contentType: detectedContentType,
    byteSize: bytes.byteLength,
    sha256,
  });

  if (staged.processingStatus !== "staged") {
    return { ...staged, resolutionCode: null };
  }

  const upload = await storage.upload(staged.storagePath, bytes, detectedContentType);
  if (upload === "exists") {
    const existing = await storage.download(staged.storagePath);
    if (!existing || digest(existing) !== sha256) {
      await repository.markProblem(staged.evidenceId, "quarantined", "integrity_mismatch");
      return {
        ...staged,
        processingStatus: "quarantined" as const,
        resolutionCode: "integrity_mismatch",
      };
    }
  }

  const resolved = await repository.finalize(
    staged.evidenceId,
    sha256,
    detectedContentType,
    bytes.byteLength,
  );
  return { ...resolved, duplicate: staged.duplicate };
}

export async function ingestMockEvidence(
  repository: EvidenceRepository,
  storage: EvidenceObjectStorage,
  request: MockEvidenceRequest,
) {
  if (request.contentBase64 === null) {
    return visibleProblem(repository, request, null, "missing", "media_missing");
  }

  const bytes = decodeBase64(request.contentBase64);
  if (!bytes) {
    return visibleProblem(repository, request, null, "quarantined", "media_unsafe");
  }
  return ingestEvidenceBytes(repository, storage, request, bytes);
}

async function reconcileOne(
  repository: EvidenceRepository,
  storage: EvidenceObjectStorage,
  pending: PendingEvidence,
): Promise<EvidenceResolution | { evidenceId: string; resolutionCode: string }> {
  const bytes = await storage.download(pending.storagePath);
  if (!bytes) {
    await repository.markProblem(pending.evidenceId, "missing", "orphan_object_missing");
    return { evidenceId: pending.evidenceId, resolutionCode: "orphan_object_missing" };
  }

  const contentType = detectImageContentType(bytes);
  const sha256 = digest(bytes);
  if (
    !contentType ||
    (pending.sha256 !== null && pending.sha256 !== sha256) ||
    (pending.contentType !== null && pending.contentType !== contentType) ||
    (pending.byteSize !== null && pending.byteSize !== bytes.byteLength)
  ) {
    await repository.markProblem(pending.evidenceId, "quarantined", "integrity_mismatch");
    return { evidenceId: pending.evidenceId, resolutionCode: "integrity_mismatch" };
  }

  return repository.finalize(pending.evidenceId, sha256, contentType, bytes.byteLength);
}

export async function reconcileStagedEvidence(
  repository: EvidenceRepository,
  storage: EvidenceObjectStorage,
  limit: number,
) {
  const pending = await repository.listStaged(limit);
  const results = [];
  for (const evidence of pending) {
    results.push(await reconcileOne(repository, storage, evidence));
  }
  return { processed: results.length, results };
}
