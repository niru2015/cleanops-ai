import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AppAccessContext } from "@/services/access-context";

const uuid = z.uuid();
const requestRow = z.object({ id: uuid, site_id: uuid, purpose: z.string(), state: z.string(),
  version: z.number(), requested_by: uuid, supply_responsibility: z.string(),
  order_reference: z.string().nullable(), created_at: z.string() });
const itemRow = z.object({ id: uuid, request_id: uuid, inventory_item_id: uuid,
  pack_count: z.coerce.number(), base_units_per_pack: z.coerce.number(),
  base_quantity: z.coerce.number(), price_per_pack: z.coerce.number(),
  requested_amount: z.coerce.number(), price_source: z.string(),
  price_reference: z.string().nullable(), received_base_quantity: z.coerce.number() });
const eventRow = z.object({ id: uuid, request_id: uuid, event_kind: z.string(),
  created_at: z.string(), detail: z.record(z.string(),z.unknown()) });
const receiptRow = z.object({ id: uuid, request_id: uuid, request_item_id: uuid,
  base_quantity: z.coerce.number(), received_at: z.string() });
const optionRow = z.object({ id: uuid, name: z.string(), sku: z.string().nullable(), unit_of_measure: z.string() });
const stockRow = z.object({ inventory_item_id: uuid, item_name: z.string(), unit_of_measure: z.string(),
  on_hand: z.coerce.number().nullable() });
const historyRow = z.object({ id: uuid, inventory_item_id: uuid, transaction_type: z.string(),
  quantity: z.coerce.number(), occurred_at: z.string(), notes: z.string().nullable(),
  supply_request_item_id: uuid.nullable() });
const comparisonRow = z.object({ site_id: uuid, inventory_item_id: uuid, item_name: z.string(),
  requested_amount: z.coerce.number(), approved_amount: z.coerce.number(),
  received_base_quantity: z.coerce.number(), approved_expense: z.coerce.number(),
  approved_labour_hours: z.coerce.number().nullable(), expense_per_approved_hour: z.coerce.number().nullable() });
const expenseRow = z.object({ id: uuid, site_id: uuid, amount: z.coerce.number(),
  currency: z.string(), posted_at: z.string() });
const linkRow = z.object({ receipt_id: uuid, expense_posting_id: uuid });

function data<T extends z.ZodType>(result: { data: unknown; error: { message: string } | null }, schema: T): z.infer<T> {
  if (result.error) throw new Error(result.error.message);
  return schema.parse(result.data);
}

export async function getSupplyWorkspace(client: SupabaseClient, access: AppAccessContext,
  siteId: string, month: string) {
  const manager = ["organization_administrator","operations_manager","area_manager"].includes(access.role);
  const [optionsResult,stockResult,historyResult,requestsResult,comparisonResult,expensesResult] = await Promise.all([
    client.rpc("list_supply_request_items",{p_site_id:siteId}),
    client.rpc("list_site_supply_stock",{p_site_id:siteId}),
    client.rpc("list_site_supply_stock_history",{p_site_id:siteId}),
    client.from("supply_requests").select("id,site_id,purpose,state,version,requested_by,supply_responsibility,order_reference,created_at")
      .eq("organization_id",access.organizationId).eq("site_id",siteId).order("created_at",{ascending:false}).limit(60),
    manager ? client.rpc("list_supply_site_comparison",{p_month:`${month}-01`}) : Promise.resolve({data:[],error:null}),
    access.canEditFinance ? client.from("expense_postings").select("id,site_id,amount,currency,posted_at")
      .eq("organization_id",access.organizationId).eq("site_id",siteId).eq("category","supplies")
      .order("posted_at",{ascending:false}).limit(40) : Promise.resolve({data:[],error:null}),
  ]);
  const requests = data(requestsResult,z.array(requestRow));
  const ids = requests.map(request=>request.id);
  const [itemsResult,eventsResult,receiptsResult] = ids.length ? await Promise.all([
    client.from("supply_request_items").select("id,request_id,inventory_item_id,pack_count,base_units_per_pack,base_quantity,price_per_pack,requested_amount,price_source,price_reference,received_base_quantity")
      .eq("organization_id",access.organizationId).eq("site_id",siteId).in("request_id",ids),
    client.from("supply_request_events").select("id,request_id,event_kind,created_at,detail")
      .eq("organization_id",access.organizationId).eq("site_id",siteId).in("request_id",ids).order("created_at",{ascending:true}),
    client.from("supply_receipts").select("id,request_id,request_item_id,base_quantity,received_at")
      .eq("organization_id",access.organizationId).eq("site_id",siteId).in("request_id",ids),
  ]) : [{data:[],error:null},{data:[],error:null},{data:[],error:null}];
  const receipts = data(receiptsResult,z.array(receiptRow));
  const linksResult = access.canEditFinance && receipts.length ? await client.from("supply_expense_links")
    .select("receipt_id,expense_posting_id").eq("organization_id",access.organizationId)
    .in("receipt_id",receipts.map(receipt=>receipt.id)) : {data:[],error:null};
  return {
    options:data(optionsResult,z.array(optionRow)),
    stock:data(stockResult,z.array(stockRow)),
    history:data(historyResult,z.array(historyRow)),
    requests,items:data(itemsResult,z.array(itemRow)),events:data(eventsResult,z.array(eventRow)),receipts,
    comparison:data(comparisonResult,z.array(comparisonRow)),
    expenses:data(expensesResult,z.array(expenseRow)),links:data(linksResult,z.array(linkRow)),
  };
}

export type SupplyWorkspace = Awaited<ReturnType<typeof getSupplyWorkspace>>;
