import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const configSchema = z.object({
  CLEANOPS_DEMO_INGRESS_ENABLED: z.enum(["true", "false"]).default("false"),
  CLEANOPS_DEMO_INGRESS_TOKEN: z.string().optional(),
  CLEANOPS_DEMO_WORKER_ID: z.string().trim().min(1).max(120).default("cleanops-local-worker"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type DemoIngressConfig = {
  enabled: boolean;
  token: string;
  workerId: string;
};

export function getDemoIngressConfig(
  environment: Record<string, string | undefined> = process.env,
): DemoIngressConfig {
  const result = configSchema.safeParse(environment);

  if (!result.success) {
    throw new Error("Demo ingress is not configured.");
  }

  const enabled =
    result.data.NODE_ENV !== "production" &&
    result.data.CLEANOPS_DEMO_INGRESS_ENABLED === "true";

  if (enabled && (!result.data.CLEANOPS_DEMO_INGRESS_TOKEN || result.data.CLEANOPS_DEMO_INGRESS_TOKEN.length < 24)) {
    throw new Error("Demo ingress is not configured.");
  }

  return {
    enabled,
    token: result.data.CLEANOPS_DEMO_INGRESS_TOKEN ?? "",
    workerId: result.data.CLEANOPS_DEMO_WORKER_ID,
  };
}

export function hasValidDemoToken(request: Request, expectedToken: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const suppliedToken = authorization.slice("Bearer ".length);
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(expectedToken);

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
