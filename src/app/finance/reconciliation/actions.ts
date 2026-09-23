"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

const id=z.uuid();
const action=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("open"),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}),
  z.object({kind:z.literal("auto"),periodId:id}),
  z.object({kind:z.literal("review"),periodId:id}),
  z.object({kind:z.literal("close"),periodId:id}),
  z.object({kind:z.literal("reopen"),periodId:id,reason:z.string().trim().min(4).max(1000)}),
  z.object({kind:z.literal("manual"),periodId:id,allocationId:id,
    entity:z.string().regex(/^(expense_posting|labor_cost_entry|inventory_issue):[0-9a-f-]{36}$/),
    amount:z.coerce.number().positive().multipleOf(0.01),reason:z.string().trim().min(4).max(1000)}),
  z.object({kind:z.literal("void"),periodId:id,linkId:id,reason:z.string().trim().min(4).max(1000)}),
]);
export async function reconcileFinance(formData:FormData){
  let target="/finance/reconciliation";
  try{
    const value=action.parse(Object.fromEntries(formData));
    const client=await createSupabaseServerClient();
    const access=await getAppAccessContext(client);
    if(!access.canEditFinance)throw new Error("Director access required.");
    const options=value.kind==="open"
      ? {name:"open_finance_period",args:{p_organization_id:access.organizationId,p_period_start:`${value.month}-01`}}
      : value.kind==="manual"
        ? {name:"match_finance_allocation",args:{p_period_id:value.periodId,p_allocation_id:value.allocationId,
            p_type:value.entity.split(":")[0],p_entity_id:z.uuid().parse(value.entity.split(":")[1]),
            p_amount:value.amount,p_reason:value.reason}}
        : value.kind==="void"
          ? {name:"void_finance_match",args:{p_link_id:value.linkId,p_reason:value.reason}}
          : value.kind==="reopen"
            ? {name:"reopen_finance_period",args:{p_period_id:value.periodId,p_reason:value.reason}}
            : {name:({auto:"run_finance_auto_match",review:"review_finance_period",close:"close_finance_period"} as const)[value.kind],args:{p_period_id:value.periodId}};
    const result=await client.rpc(options.name,options.args);
    if(result.error)throw new Error(result.error.message);
    const periodId=value.kind==="open"?z.uuid().parse(result.data):value.periodId;
    target+=`?periodId=${periodId}&notice=${encodeURIComponent(value.kind==="auto"?`${result.data} deterministic matches linked`:`${value.kind} saved`)}`;
    revalidatePath("/finance/reconciliation");revalidatePath("/finance");
  }catch(error){
    target+=`?error=${encodeURIComponent(error instanceof Error?error.message:"Finance action failed")}`;
  }
  redirect(target);
}
