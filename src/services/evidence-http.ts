import { hasValidDemoToken, type DemoIngressConfig } from "@/services/demo-ingress-auth";
import {
  evidenceReconcileRequestSchema,
  mockEvidenceRequestSchema,
} from "@/schemas/evidence";
import { ingestMockEvidence, reconcileStagedEvidence } from "@/services/evidence-media";
import {
  EvidenceRepositoryError,
  type EvidenceObjectStorage,
  type EvidenceRepository,
} from "@/services/evidence-repository";

const MAX_EVIDENCE_REQUEST_BYTES = 14_500_000;
const MAX_RECONCILE_REQUEST_BYTES = 4_096;

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

async function readJson(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { error: "payload_too_large" as const };
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { error: "payload_too_large" as const };
  }
  try {
    return { data: JSON.parse(raw) as unknown };
  } catch {
    return { error: "invalid_json" as const };
  }
}

function authorize(request: Request, config: DemoIngressConfig) {
  if (!config.enabled) return json({ error: "not_found" }, 404);
  if (!hasValidDemoToken(request, config.token)) return json({ error: "unauthorized" }, 401);
  return null;
}

function repositoryFailure(error: unknown) {
  if (error instanceof EvidenceRepositoryError) {
    if (error.code === "source_not_found") {
      return json({ error: "unknown_media_source" }, 422);
    }
    if (error.code === "identity_conflict") {
      return json({ error: "media_identity_conflict" }, 409);
    }
  }
  return json({ error: "evidence_processing_unavailable" }, 503, { "retry-after": "5" });
}

export async function handleDemoEvidenceRequest(
  request: Request,
  repository: EvidenceRepository,
  storage: EvidenceObjectStorage,
  config: DemoIngressConfig,
) {
  const denied = authorize(request, config);
  if (denied) return denied;

  const body = await readJson(request, MAX_EVIDENCE_REQUEST_BYTES);
  if ("error" in body) {
    return json({ error: body.error }, body.error === "payload_too_large" ? 413 : 400);
  }
  const parsed = mockEvidenceRequestSchema.safeParse(body.data);
  if (!parsed.success) return json({ error: "invalid_payload" }, 400);

  try {
    return json(await ingestMockEvidence(repository, storage, parsed.data), 200);
  } catch (error) {
    return repositoryFailure(error);
  }
}

export async function handleEvidenceReconcileRequest(
  request: Request,
  repository: EvidenceRepository,
  storage: EvidenceObjectStorage,
  config: DemoIngressConfig,
) {
  const denied = authorize(request, config);
  if (denied) return denied;

  const body = await readJson(request, MAX_RECONCILE_REQUEST_BYTES);
  if ("error" in body) {
    return json({ error: body.error }, body.error === "payload_too_large" ? 413 : 400);
  }
  const parsed = evidenceReconcileRequestSchema.safeParse(body.data);
  if (!parsed.success) return json({ error: "invalid_payload" }, 400);

  try {
    return json(await reconcileStagedEvidence(repository, storage, parsed.data.limit), 200);
  } catch (error) {
    return repositoryFailure(error);
  }
}
