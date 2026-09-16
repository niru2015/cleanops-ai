import {
  getAuthorizedEvidencePath,
  SupabaseEvidenceObjectStorage,
} from "@/integrations/evidence/supabase-evidence";
import { requireAuthenticatedClaims } from "@/lib/supabase/auth";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issueEvidenceSignedUrl } from "@/services/evidence-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  const { evidenceId } = await context.params;
  const sessionClient = await createSupabaseServerClient();
  try {
    const storage = new SupabaseEvidenceObjectStorage(createPrivilegedSupabaseClient());
    const result = await issueEvidenceSignedUrl(
      { getAuthorizedPath: (id) => getAuthorizedEvidencePath(sessionClient, id) },
      storage,
      evidenceId,
    );
    if (!result) {
      return Response.json(
        { error: "not_found" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(result, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "storage_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": "5" } },
    );
  }
}
