import { applyEvidenceResolution } from "@/integrations/evidence/supabase-evidence";
import { requireAuthenticatedClaims } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evidenceResolutionRequestSchema } from "@/schemas/evidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  try {
    await requireAuthenticatedClaims();
  } catch {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return Response.json(
      { error: "payload_too_large" },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 4_096) {
    return Response.json(
      { error: "payload_too_large" },
      { status: 413, headers: { "cache-control": "no-store" } },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    body = null;
  }
  const parsed = evidenceResolutionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_payload" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const { evidenceId } = await context.params;
  const client = await createSupabaseServerClient();
  const result = await applyEvidenceResolution(client, evidenceId, parsed.data);
  return Response.json(result, {
    status: result.applied ? 200 : result.error === "denied" ? 403 : 503,
    headers: { "cache-control": "no-store" },
  });
}
