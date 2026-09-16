import { describe, expect, it } from "vitest";
import { issueEvidenceSignedUrl } from "@/services/evidence-access";
import {
  detectImageContentType,
  ingestMockEvidence,
  reconcileStagedEvidence,
} from "@/services/evidence-media";
import type {
  BeginEvidenceInput,
  EvidenceObjectStorage,
  EvidenceRepository,
  EvidenceResolution,
  PendingEvidence,
  StagedEvidence,
} from "@/services/evidence-repository";

const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

class MemoryEvidenceRepository implements EvidenceRepository {
  readonly records = new Map<string, StagedEvidence & PendingEvidence & { resolutionCode: string | null }>();
  finalizeFailures = 0;

  async begin(input: BeginEvidenceInput) {
    const key = `${input.externalAccountId}:${input.externalMessageId}:${input.mediaExternalId}`;
    const existing = this.records.get(key);
    if (existing) return { ...existing, duplicate: true };
    const evidenceId = `evidence-${this.records.size + 1}`;
    const staged = {
      evidenceId,
      storagePath: `tenant/${evidenceId}/source.png`,
      processingStatus: "staged" as const,
      linkageStatus: "unresolved" as const,
      duplicate: false,
      sha256: input.sha256,
      contentType: input.contentType,
      byteSize: input.byteSize,
      resolutionCode: null,
    };
    this.records.set(key, staged);
    return staged;
  }

  async markProblem(
    evidenceId: string,
    status: "quarantined" | "missing",
    errorCode: string,
  ) {
    const record = [...this.records.values()].find((item) => item.evidenceId === evidenceId);
    if (!record || record.processingStatus !== "staged") return false;
    record.processingStatus = status;
    record.resolutionCode = errorCode;
    return true;
  }

  async finalize(evidenceId: string) {
    if (this.finalizeFailures > 0) {
      this.finalizeFailures -= 1;
      throw new Error("simulated crash after upload");
    }
    const record = [...this.records.values()].find((item) => item.evidenceId === evidenceId);
    if (!record) throw new Error("missing evidence");
    record.processingStatus = "ready";
    record.linkageStatus = "linked";
    return {
      evidenceId,
      processingStatus: "ready",
      linkageStatus: "linked",
      resolutionCode: null,
      taskRunId: "task-run",
      submissionRevision: 1,
      role: "before",
      pairId: null,
    } satisfies EvidenceResolution;
  }

  async listStaged(limit: number) {
    return [...this.records.values()]
      .filter((item) => item.processingStatus === "staged")
      .slice(0, limit)
      .map(({ evidenceId, storagePath, sha256, contentType, byteSize }) => ({
        evidenceId,
        storagePath,
        sha256,
        contentType,
        byteSize,
      }));
  }
}

class MemoryStorage implements EvidenceObjectStorage {
  readonly objects = new Map<string, Uint8Array>();
  uploadCalls = 0;
  signedPaths: string[] = [];

  async upload(path: string, bytes: Uint8Array) {
    this.uploadCalls += 1;
    if (this.objects.has(path)) return "exists" as const;
    this.objects.set(path, bytes);
    return "uploaded" as const;
  }

  async download(path: string) {
    return this.objects.get(path) ?? null;
  }

  async createSignedUrl(path: string, expiresInSeconds: number) {
    this.signedPaths.push(path);
    return `https://storage.example/${path}?expires=${expiresInSeconds}`;
  }
}

function request(overrides: Partial<{
  declaredContentType: string | null;
  contentBase64: string | null;
}> = {}) {
  return {
    accountExternalId: "demo-nightshift-group",
    externalMessageId: "message-before",
    mediaExternalId: "media-before",
    declaredContentType: "image/png",
    contentBase64: Buffer.from(png).toString("base64"),
    ...overrides,
  };
}

describe("CLEAN-004 media processing", () => {
  it("detects supported image signatures instead of trusting the declared type", () => {
    expect(detectImageContentType(png)).toBe("image/png");
    expect(detectImageContentType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("uploads and finalizes valid synthetic media", async () => {
    const repository = new MemoryEvidenceRepository();
    const storage = new MemoryStorage();

    const result = await ingestMockEvidence(repository, storage, request());

    expect(result.processingStatus).toBe("ready");
    expect(result.linkageStatus).toBe("linked");
    expect(storage.uploadCalls).toBe(1);
  });

  it("keeps missing and unsafe media visible without uploading it", async () => {
    const repository = new MemoryEvidenceRepository();
    const storage = new MemoryStorage();
    const missing = await ingestMockEvidence(
      repository,
      storage,
      request({ contentBase64: null }),
    );
    const unsafe = await ingestMockEvidence(
      repository,
      storage,
      {
        ...request({ contentBase64: Buffer.from([1, 2, 3]).toString("base64") }),
        mediaExternalId: "unsafe-media",
      },
    );

    expect(missing.resolutionCode).toBe("media_missing");
    expect(unsafe.resolutionCode).toBe("media_unsafe");
    expect(storage.uploadCalls).toBe(0);
  });

  it("quarantines oversized media while retaining a visible record", async () => {
    const repository = new MemoryEvidenceRepository();
    const storage = new MemoryStorage();
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");

    const result = await ingestMockEvidence(
      repository,
      storage,
      request({ contentBase64: oversized }),
    );

    expect(result.resolutionCode).toBe("media_too_large");
    expect(storage.uploadCalls).toBe(0);
    expect([...repository.records.values()][0]?.processingStatus).toBe("quarantined");
  });

  it("does not upload an already-finalized media replay", async () => {
    const repository = new MemoryEvidenceRepository();
    const storage = new MemoryStorage();
    await ingestMockEvidence(repository, storage, request());
    const replay = await ingestMockEvidence(repository, storage, request());

    expect(replay.duplicate).toBe(true);
    expect(storage.uploadCalls).toBe(1);
  });

  it("reconciles a crash after upload from the persisted staged row", async () => {
    const repository = new MemoryEvidenceRepository();
    const storage = new MemoryStorage();
    repository.finalizeFailures = 1;

    await expect(ingestMockEvidence(repository, storage, request())).rejects.toThrow(
      "simulated crash",
    );
    expect([...repository.records.values()][0]?.processingStatus).toBe("staged");

    const reconciled = await reconcileStagedEvidence(repository, storage, 20);
    expect(reconciled.processed).toBe(1);
    expect([...repository.records.values()][0]?.processingStatus).toBe("ready");
    expect(storage.uploadCalls).toBe(1);
  });

  it("issues a one-minute signed URL only after row-level access succeeds", async () => {
    const storage = new MemoryStorage();
    const denied = await issueEvidenceSignedUrl(
      { getAuthorizedPath: async () => null },
      storage,
      "evidence-denied",
    );
    const allowed = await issueEvidenceSignedUrl(
      { getAuthorizedPath: async () => "tenant/evidence/source.png" },
      storage,
      "evidence-allowed",
    );

    expect(denied).toBeNull();
    expect(allowed?.expiresIn).toBe(60);
    expect(storage.signedPaths).toEqual(["tenant/evidence/source.png"]);
  });
});
