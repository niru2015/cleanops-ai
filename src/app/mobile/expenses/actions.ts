"use server";

import { randomUUID, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";
import { createExpenseUploadTicket,verifyExpenseUploadTicket } from "@/services/expense-upload-ticket";

const bucket="expense-receipts";
const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
function detect(bytes:Uint8Array){
  const head=Buffer.from(bytes.subarray(0,12));
  if(head.subarray(0,5).toString()==="%PDF-")return "application/pdf";
  if(head.subarray(0,3).equals(Buffer.from([255,216,255])))return "image/jpeg";
  if(head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(head.subarray(0,4).toString()==="RIFF"&&head.subarray(8,12).toString()==="WEBP")return "image/webp";
  return null;
}
async function sourceAccess(intakeId:string){
  const client=await createSupabaseServerClient();
  const access=await getAppAccessContext(client);
  const result=await createPrivilegedSupabaseClient().from("finance_intake_items")
    .select("id,organization_id,site_id,submitted_by,review_state")
    .eq("id",intakeId).eq("organization_id",access.organizationId).maybeSingle();
  const item=result.data;
  if(result.error||!item||!item.site_id||!isSiteAllowed(access,item.site_id)||
    (item.submitted_by!==access.userId&&!access.canViewFinance)||
    ["posted","rejected"].includes(item.review_state))throw new Error("Expense source unavailable.");
  return {client,access,item};
}
function failure(error:unknown){return {ok:false as const,message:error instanceof Error?error.message:"Receipt operation failed."};}
export async function submitAppExpense(input:unknown){
  try{
    const value=z.object({siteId:z.uuid(),text:z.string().trim().min(4).max(2000)}).parse(input);
    const client=await createSupabaseServerClient();
    const access=await getAppAccessContext(client);
    if(!["cleaner","site_supervisor","area_manager"].includes(access.role)||!isSiteAllowed(access,value.siteId))
      throw new Error("Expense submission is not available for this site.");
    const result=await client.rpc("submit_app_finance_intake",{p_site_id:value.siteId,p_text:value.text});
    if(result.error)throw new Error(result.error.message);
    revalidatePath("/finance/inbox");
    return {ok:true as const,intakeId:String(result.data),message:"Expense submitted. Add its receipt before review."};
  }catch(error){return failure(error);}
}
export async function prepareExpenseReceiptUpload(input:unknown){
  try{
    const value=z.object({intakeId:z.uuid(),mime:z.string(),byteSize:z.number().int().min(1).max(10485760),
      sha256:z.string().regex(/^[0-9a-f]{64}$/)}).parse(input);
    const {access,item}=await sourceAccess(value.intakeId);
    if(!allowed.has(value.mime))throw new Error("Choose a PDF, JPEG, PNG or WebP receipt.");
    const admin=createPrivilegedSupabaseClient();
    const documentId=randomUUID();
    const path=`${access.organizationId}/${item.site_id}/${item.id}/${documentId}`;
    const inserted=await admin.from("expense_documents").insert({id:documentId,organization_id:access.organizationId,
      intake_id:item.id,storage_bucket:bucket,storage_path:path,declared_mime:value.mime,
      claimed_byte_size:value.byteSize,claimed_sha256:value.sha256,status:"staged"});
    if(inserted.error)throw new Error("Receipt record could not be prepared.");
    const signed=await admin.storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
    if(signed.error||!signed.data?.token)throw new Error("Receipt upload token unavailable.");
    return {ok:true as const,upload:{path,token:signed.data.token,
      ...createExpenseUploadTicket(documentId,access.userId)}};
  }catch(error){return failure(error);}
}
export async function finalizeExpenseReceiptUpload(input:unknown){
  try{
    const value=z.object({intakeId:z.uuid(),documentId:z.uuid(),expiresAt:z.number().int(),
      signature:z.string().regex(/^[0-9a-f]{64}$/)}).parse(input);
    const {access,item}=await sourceAccess(value.intakeId);
    if(!verifyExpenseUploadTicket(value,access.userId))throw new Error("Receipt upload token expired.");
    const admin=createPrivilegedSupabaseClient();
    const found=await admin.from("expense_documents")
      .select("id,organization_id,intake_id,storage_path,declared_mime,claimed_byte_size,claimed_sha256,status")
      .eq("id",value.documentId).maybeSingle();
    const row=found.data;
    if(found.error||!row||row.organization_id!==access.organizationId||row.intake_id!==item.id||row.status!=="staged")
      throw new Error("Staged receipt unavailable.");
    const downloaded=await admin.storage.from(bucket).download(row.storage_path);
    if(downloaded.error||!downloaded.data||downloaded.data.size>10485760)
      throw new Error("Private receipt could not be read.");
    const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
    const mime=detect(bytes);
    const sha256=createHash("sha256").update(bytes).digest("hex");
    if(bytes.length!==row.claimed_byte_size||mime!==row.declared_mime||sha256!==row.claimed_sha256){
      await admin.storage.from(bucket).remove([row.storage_path]);
      await admin.from("expense_documents").update({status:"quarantined"}).eq("id",row.id);
      throw new Error("Receipt bytes differ from the prepared file.");
    }
    const updated=await admin.from("expense_documents").update({status:"ready",detected_mime:mime,
      byte_size:bytes.length,sha256,verified_at:new Date().toISOString()}).eq("id",row.id).eq("status","staged");
    if(updated.error)throw new Error("Receipt verification could not be saved.");
    revalidatePath("/finance/inbox"); revalidatePath("/finance/expenses");
    return {ok:true as const,message:"Receipt verified for finance review."};
  }catch(error){return failure(error);}
}
