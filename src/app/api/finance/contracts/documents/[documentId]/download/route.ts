import { z } from "zod";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const id = z.uuid().parse(documentId);
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!["organization_administrator", "area_manager"].includes(access.role))
      return new Response("Not found", { status: 404 });
    const result = await client.from("contract_documents")
      .select("organization_id,site_id,storage_path,status")
      .eq("id", id).eq("organization_id", access.organizationId).maybeSingle();
    if (result.error || !result.data || result.data.status !== "ready" ||
      !isSiteAllowed(access, result.data.site_id)) return new Response("Not found", { status: 404 });
    const signed = await createPrivilegedSupabaseClient().storage.from("contract-documents")
      .createSignedUrl(result.data.storage_path, 60, { download: true });
    if (signed.error || !signed.data?.signedUrl) return new Response("Unavailable", { status: 503 });
    return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl,
      "Cache-Control": "private, no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
