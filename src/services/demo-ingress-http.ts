import { IngressRepositoryError, type IngressRepository } from "@/services/ingress-repository";
import { acceptDemoMessageBatch } from "@/services/demo-ingress";
import {
  hasValidDemoToken,
  type DemoIngressConfig,
} from "@/services/demo-ingress-auth";
import { mockMessageBatchSchema, workerCommandSchema } from "@/schemas/mock-message";
import { processNextIngressJob } from "@/services/ingress-worker";

const MAX_INGRESS_BYTES = 256 * 1024;
const MAX_COMMAND_BYTES = 4 * 1024;

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function demoIngressDisabledResponse() {
  return json({ error: "not_found" }, 404);
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
  if (!config.enabled) return demoIngressDisabledResponse();
  if (!hasValidDemoToken(request, config.token)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

export async function handleDemoMessageRequest(
  request: Request,
  repository: IngressRepository,
  config: DemoIngressConfig,
) {
  const denied = authorize(request, config);
  if (denied) return denied;

  const body = await readJson(request, MAX_INGRESS_BYTES);
  if ("error" in body) {
    return json({ error: body.error }, body.error === "payload_too_large" ? 413 : 400);
  }

  const batch = mockMessageBatchSchema.safeParse(body.data);
  if (!batch.success) {
    return json({ error: "invalid_payload" }, 400);
  }

  try {
    const accepted = await acceptDemoMessageBatch(repository, batch.data);
    return json(accepted, 202);
  } catch (error) {
    if (error instanceof IngressRepositoryError && error.code === "account_not_found") {
      return json({ error: "unknown_integration_account" }, 422);
    }
    return json({ error: "durability_unavailable" }, 503, { "retry-after": "5" });
  }
}

export async function handleDemoWorkerRequest(
  request: Request,
  repository: IngressRepository,
  config: DemoIngressConfig,
) {
  const denied = authorize(request, config);
  if (denied) return denied;

  const body = await readJson(request, MAX_COMMAND_BYTES);
  if ("error" in body) {
    return json({ error: body.error }, body.error === "payload_too_large" ? 413 : 400);
  }

  const command = workerCommandSchema.safeParse(body.data);
  if (!command.success) return json({ error: "invalid_command" }, 400);

  try {
    if (command.data.action === "retry") {
      const retried = await repository.retryFailedJob(command.data.jobId);
      return json({ retried, jobId: command.data.jobId }, retried ? 200 : 409);
    }

    const result = await processNextIngressJob(repository, {
      workerId: command.data.workerId ?? config.workerId,
      leaseSeconds: command.data.leaseSeconds,
    });
    return json(result, 200);
  } catch {
    return json({ error: "worker_unavailable" }, 503, { "retry-after": "5" });
  }
}
