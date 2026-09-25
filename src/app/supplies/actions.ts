"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";

const uuid = z.uuid();
const item = z.object({ itemId:uuid,packCount:z.number().positive().max(100000),
  baseUnitsPerPack:z.number().positive().max(100000),pricePerPack:z.number().nonnegative().max(10000000),
  priceSource:z.enum(["supplier_quote","catalogue","invoice","manual_estimate"]),
  priceReference:z.string().trim().max(200).optional() });
const actionSchema = z.discriminatedUnion("kind",[
  z.object({kind:z.literal("submit"),siteId:uuid,purpose:z.string().trim().min(3).max(500),
    items:z.array(item).min(1).max(20),requestKey:uuid}),
  z.object({kind:z.literal("revise"),itemId:uuid,item}),
  z.object({kind:z.literal("decide"),requestId:uuid,decision:z.enum(["approved","rejected"]),
    reason:z.string().trim().max(500)}),
  z.object({kind:z.literal("order"),requestId:uuid,orderReference:z.string().trim().min(3).max(160)}),
  z.object({kind:z.literal("cancel"),requestId:uuid,reason:z.string().trim().min(3).max(500)}),
  z.object({kind:z.literal("receive"),requestItemId:uuid,baseQuantity:z.number().positive(),receiptKey:uuid}),
  z.object({kind:z.literal("movement"),siteId:uuid,itemId:uuid,
    movementKind:z.enum(["opening","issue","return","transfer","count"]),
    quantity:z.number().nonnegative(),key:uuid,reason:z.string().trim().min(3).max(500),
    targetSiteId:uuid.optional()}),
  z.object({kind:z.literal("link_expense"),receiptId:uuid,expensePostingId:uuid}),
]);

export async function performSupplyAction(input: unknown) {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) return {ok:false as const,message:"Check the supply form fields and try again."};
  try {
    const action = parsed.data;
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canManageOperations) throw new Error("Operational supply access required.");
    if (action.kind === "submit" || action.kind === "movement") {
      if (!isSiteAllowed(access,action.siteId)) throw new Error("Site supply access required.");
      if (action.kind === "movement" && action.targetSiteId && !isSiteAllowed(access,action.targetSiteId))
        throw new Error("Target site access required.");
    }
    if (["decide","order","cancel"].includes(action.kind)) {
      const id = "requestId" in action ? action.requestId : "";
      const request = await client.from("supply_requests").select("site_id")
        .eq("organization_id",access.organizationId).eq("id",id).maybeSingle();
      if (request.error || !request.data || !isSiteAllowed(access,request.data.site_id))
        throw new Error("Supply request unavailable for this site.");
    }
    let result: {error:{message:string}|null};
    switch (action.kind) {
      case "submit": result = await client.rpc("submit_supply_request",{
        p_site_id:action.siteId,p_purpose:action.purpose,p_items:action.items,
        p_request_key:action.requestKey }); break;
      case "revise": result = await client.rpc("revise_supply_request_item",{
        p_item_id:action.itemId,p_inventory_item_id:action.item.itemId,
        p_pack_count:action.item.packCount,p_base_units_per_pack:action.item.baseUnitsPerPack,
        p_price_per_pack:action.item.pricePerPack,p_price_source:action.item.priceSource,
        p_price_reference:action.item.priceReference??null }); break;
      case "decide": result = await client.rpc("decide_supply_request",{
        p_request_id:action.requestId,p_decision:action.decision,p_reason:action.reason }); break;
      case "order": result = await client.rpc("order_supply_request",{
        p_request_id:action.requestId,p_order_reference:action.orderReference }); break;
      case "cancel": result = await client.rpc("cancel_supply_request",{
        p_request_id:action.requestId,p_reason:action.reason }); break;
      case "receive": result = await client.rpc("receive_supply_request_item",{
        p_request_item_id:action.requestItemId,p_base_quantity:action.baseQuantity,
        p_receipt_key:action.receiptKey }); break;
      case "movement": result = await client.rpc("record_supply_stock_movement",{
        p_site_id:action.siteId,p_item_id:action.itemId,p_kind:action.movementKind,
        p_quantity:action.quantity,p_key:action.key,p_reason:action.reason,
        p_target_site_id:action.targetSiteId??null }); break;
      case "link_expense":
        if (!access.canEditFinance) throw new Error("Director approval is required to link an expense.");
        result = await client.rpc("link_supply_receipt_expense",{
          p_receipt_id:action.receiptId,p_expense_posting_id:action.expensePostingId }); break;
    }
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/supplies"); revalidatePath("/finance");
    return {ok:true as const,message:"Supply record saved. The request, stock movement and approved expense remain separate."};
  } catch (error) {
    return {ok:false as const,message:error instanceof Error ? error.message : "Supply action failed."};
  }
}
