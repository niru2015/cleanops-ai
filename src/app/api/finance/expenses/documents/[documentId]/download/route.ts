import { z } from "zod";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext,isSiteAllowed } from "@/services/access-context";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{documentId:string}>}){
  try{
    const id=z.uuid().parse((await params).documentId);
    const client=await createSupabaseServerClient();
    const access=await getAppAccessContext(client);
    if(!access.canViewFinance)return new Response("Not found",{status:404});
    const result=await client.from("expense_documents")
      .select("intake_id,storage_bucket,storage_path,status")
      .eq("id",id).eq("organization_id",access.organizationId).maybeSingle();
    if(result.error||!result.data||result.data.status!=="ready")return new Response("Not found",{status:404});
    const intake=await client.from("finance_intake_items").select("site_id")
      .eq("id",result.data.intake_id).eq("organization_id",access.organizationId).maybeSingle();
    if(intake.error||!intake.data||(intake.data.site_id&&!isSiteAllowed(access,intake.data.site_id)))
      return new Response("Not found",{status:404});
    const signed=await createPrivilegedSupabaseClient().storage.from(result.data.storage_bucket)
      .createSignedUrl(result.data.storage_path,60,{download:true});
    if(signed.error||!signed.data?.signedUrl)return new Response("Unavailable",{status:503});
    return new Response(null,{status:302,headers:{Location:signed.data.signedUrl,
      "Cache-Control":"private, no-store"}});
  }catch{return new Response("Not found",{status:404});}
}
