"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";
import { expenseResolution } from "@/schemas/finance-expenses";
import { suggestFinanceExpense } from "@/services/finance-expenses";
import { contractSha256, readContractPages } from "@/services/contract-extraction";

function failure(error: unknown) {
  return { ok: false as const, message: error instanceof Error ? error.message : "Expense review failed." };
}
async function reviewer() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  if (!access.canViewFinance) throw new Error("Finance review access required.");
  return { client, access };
}
async function visibleIntake(id: string) {
  const { client, access } = await reviewer();
  const result = await client.from("finance_intake_items")
    .select("id,organization_id,site_id,source_text,review_state,proposed")
    .eq("id",id).eq("organization_id",access.organizationId).maybeSingle();
  if (result.error || !result.data || (result.data.site_id && !isSiteAllowed(access,result.data.site_id)))
    throw new Error("Finance candidate unavailable.");
  return { client, access, intake: result.data };
}
export async function suggestExpense(input: unknown) {
  try {
    const id = z.uuid().parse(input);
    const { access, intake } = await visibleIntake(id);
    if (["posted","rejected"].includes(intake.review_state)) throw new Error("Candidate is final.");
    const admin = createPrivilegedSupabaseClient();
    let receiptText="";
    const document=await admin.from("expense_documents")
      .select("id,storage_bucket,storage_path,detected_mime,sha256")
      .eq("organization_id",access.organizationId).eq("intake_id",id).eq("status","ready")
      .order("created_at").limit(1).maybeSingle();
    if(document.error)throw new Error("Receipt source could not be checked.");
    if(document.data?.detected_mime&&document.data.sha256){
      const downloaded=await admin.storage.from(document.data.storage_bucket).download(document.data.storage_path);
      if(downloaded.error||!downloaded.data||downloaded.data.size>10485760)
        throw new Error("Receipt source could not be read.");
      const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
      if(contractSha256(bytes)!==document.data.sha256)throw new Error("Receipt integrity check failed.");
      try{
        const pages=await readContractPages(bytes,document.data.detected_mime);
        receiptText=pages.map(page=>page.text).join("\n").slice(0,5000);
        await admin.from("expense_documents").update({extraction_provenance:{provider:"local-text-ocr",
          version:1,pageCount:pages.length,textSnippet:receiptText.slice(0,300)}}).eq("id",document.data.id);
      }catch{receiptText="";}
    }
    const proposed=suggestFinanceExpense(`${receiptText}\n${intake.source_text}`);
    const updated = await admin.from("finance_intake_items").update({ proposed,
      extraction_state: "suggested", review_state: "needs_review",updated_at: new Date().toISOString() })
      .eq("id",id).eq("organization_id",access.organizationId)
      .in("review_state",["pending","needs_review","resolved"]);
    if (updated.error) throw new Error("Suggestions could not be saved.");
    const audit = await admin.from("expense_audit_events").insert({ organization_id:access.organizationId,
      intake_id:id,event_kind:"suggested",new_value:proposed,actor_id:access.userId });
    if (audit.error) throw new Error("Suggestion audit could not be saved.");
    revalidatePath("/finance/inbox");
    return { ok: true as const, message: "Suggestions are ready for human review." };
  } catch (error) { return failure(error); }
}
export async function resolveExpense(input: unknown) {
  try {
    const value = expenseResolution.parse(input);
    const { client, access } = await visibleIntake(value.intakeId);
    if (!isSiteAllowed(access,value.siteId) || value.allocations?.some((a)=>!isSiteAllowed(access,a.siteId)))
      throw new Error("Expense site access denied.");
    const result = await client.rpc("resolve_finance_intake",{
      p_intake_id:value.intakeId,p_site_id:value.siteId,p_category:value.category,
      p_vendor:value.vendor,p_expense_date:value.expenseDate,p_payment_method:value.paymentMethod,
      p_currency:value.currency,p_subtotal:value.subtotal,p_tax:value.tax,p_total:value.total,
      p_description:value.description,p_contract_id:value.contractId,
      p_project_reference:value.projectReference,p_allocations:value.allocations,
      p_reason:value.reason,
    });
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/finance/inbox"); revalidatePath("/finance/expenses");
    return { ok:true as const, claimId:String(result.data),message:"Expense details saved for Director approval." };
  } catch(error) { return failure(error); }
}
export async function rejectExpense(input: unknown) {
  try {
    const value=z.object({intakeId:z.uuid(),reason:z.string().trim().min(4).max(500)}).parse(input);
    const {client}=await visibleIntake(value.intakeId);
    const result=await client.rpc("reject_finance_intake",{p_intake_id:value.intakeId,p_reason:value.reason});
    if(result.error) throw new Error(result.error.message);
    revalidatePath("/finance/inbox"); revalidatePath("/finance/expenses");
    return {ok:true as const,message:"Candidate rejected; no cost was posted."};
  }catch(error){return failure(error);}
}
export async function approveExpense(input: unknown) {
  try {
    const claimId=z.uuid().parse(input);
    const {client,access}=await reviewer();
    if(!access.canEditFinance) throw new Error("Director approval required.");
    const result=await client.rpc("approve_finance_expense",{p_claim_id:claimId});
    if(result.error) throw new Error(result.error.message);
    revalidatePath("/finance/inbox"); revalidatePath("/finance/expenses");
    return {ok:true as const,message:"Expense approved and posted once."};
  }catch(error){return failure(error);}
}
