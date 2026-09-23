import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AppAccessContext } from "@/services/access-context";

const id = z.uuid();
const metrics = z.object({
  acceptedBatches:z.number(),completeCoverageBatches:z.number(),incompleteBatches:z.number(),
  operationalCount:z.number(),operationalAmount:z.number(),matchedCount:z.number(),matchedAmount:z.number(),
  unmatchedOperationalAmount:z.number(),sourceAllocationCount:z.number(),sourceAmount:z.number(),
  unallocatedSourceAmount:z.number(),ambiguousSourceCount:z.number(),invalidSourceCount:z.number(),
  invalidLinkCount:z.number(),coverage:z.string(),batchFingerprint:z.string(),
  sourceFingerprint:z.string(),operationalFingerprint:z.string(),
});
const period = z.object({ period_id:id,period_start:z.string(),period_end:z.string(),currency:z.string(),
  state:z.enum(["open","review","closed","reopened"]),close_version:z.number(),metrics,stale:z.boolean() });
const sitePeriod = z.object({ period_id:id,site_id:id,period_start:z.string(),currency:z.string(),
  state:z.string(),coverage:z.string(),operational_count:z.number(),operational_amount:z.number(),
  matched_amount:z.number(),unmatched_amount:z.number(),unallocated_source_amount:z.number(),stale:z.boolean() });
const batch = z.object({ id,source_file_name:z.string(),completeness:z.string(),state:z.string(),
  service_period_start:z.string(),service_period_end:z.string() });
const source = z.object({ id,import_batch_id:id,category:z.string(),amount:z.number(),currency:z.string(),
  service_period:z.string(),source_document_id:z.string().nullable(),approval_state:z.string(),recognition_state:z.string() });
const allocation = z.object({ id,source_row_id:id,site_id:id,project_id:id.nullable(),amount:z.number() });
const link = z.object({ id,period_id:id,source_allocation_id:id,operational_entity_type:z.string(),
  operational_entity_id:id,matched_amount:z.number(),match_rule:z.string(),state:z.string(),
  rationale:z.string(),linked_at:z.string() });
const candidate = z.object({ source_allocation_id:id,source_row_id:id,operational_entity_type:z.string(),
  operational_entity_id:id,site_id:id,currency:z.string(),amount:z.number(),rule:z.string(),
  rule_priority:z.number(),ambiguous:z.boolean() });
const operationalSchema = z.object({entity_type:z.string(),entity_id:id,site_id:id,category:z.string(),
  currency:z.string(),amount:z.number(),matched_amount:z.number(),service_date:z.string(),
  project_id:id.nullable(),source_reference:z.string().nullable()});
async function read<T>(query:PromiseLike<{data:unknown;error:{message:string}|null}>,schema:z.ZodType<T>):Promise<T>{
  const result=await query;
  if(result.error)throw new Error(result.error.message);
  return schema.parse(result.data);
}
async function readAll<T>(query:(from:number,to:number)=>PromiseLike<{data:unknown;error:{message:string}|null}>,schema:z.ZodType<T>):Promise<T[]>{
  const all:T[]=[];
  for(let from=0;from<100_000;from+=500){
    const page=await read(query(from,from+499),z.array(schema));
    all.push(...page);
    if(page.length<500)return all;
  }
  throw new Error("Finance result exceeded the supported review limit.");
}
export async function getReconciliationWorkspace(client:SupabaseClient,access:AppAccessContext,selectedPeriodId?:string){
  const sites=await readAll((from,to)=>client.rpc("list_finance_period_site_status").range(from,to),sitePeriod);
  if(!access.canEditFinance)return {sites:sites.filter(row=>access.sites.some(site=>site.id===row.site_id)),periods:[],selected:null,batches:[],sources:[],allocations:[],links:[],candidates:[],operational:[]};
  const periods=await readAll((from,to)=>client.rpc("list_finance_period_status").range(from,to),period);
  const selected=periods.find(row=>row.period_id===selectedPeriodId)??periods[0]??null;
  if(!selected)return {sites,periods,selected,batches:[],sources:[],allocations:[],links:[],candidates:[],operational:[]};
  const [batches,sources,links,candidates,operational]=await Promise.all([
    readAll((from,to)=>client.from("finance_import_batches").select("id,source_file_name,completeness,state,service_period_start,service_period_end")
      .eq("organization_id",access.organizationId).eq("state","accepted").lte("service_period_start",selected.period_end)
      .gte("service_period_end",selected.period_start).order("id").range(from,to),batch),
    readAll((from,to)=>client.from("finance_source_rows").select("id,import_batch_id,category,amount,currency,service_period,source_document_id,approval_state,recognition_state")
      .eq("organization_id",access.organizationId).gte("service_period",selected.period_start)
      .lte("service_period",selected.period_end).order("id").range(from,to),source),
    readAll((from,to)=>client.from("finance_reconciliation_links").select("id,period_id,source_allocation_id,operational_entity_type,operational_entity_id,matched_amount,match_rule,state,rationale,linked_at")
      .eq("organization_id",access.organizationId).eq("period_id",selected.period_id)
      .order("id").range(from,to),link),
    readAll((from,to)=>client.rpc("list_finance_match_candidates",{p_period_id:selected.period_id}).range(from,to),candidate),
    readAll((from,to)=>client.rpc("list_finance_operational_rows",{p_period_id:selected.period_id}).range(from,to),operationalSchema),
  ]);
  const accepted=new Set(batches.map(item=>item.id));
  const acceptedSources=sources.filter(item=>accepted.has(item.import_batch_id));
  const sourceIds=acceptedSources.map(item=>item.id);
  const allocationPages=await Promise.all(Array.from({length:Math.ceil(sourceIds.length/100)},(_,index)=>{
    const ids=sourceIds.slice(index*100,index*100+100);
    return readAll((from,to)=>client.from("finance_source_allocations").select("id,source_row_id,site_id,project_id,amount")
      .eq("organization_id",access.organizationId).in("source_row_id",ids).order("id").range(from,to),allocation);
  }));
  return {sites,periods,selected,batches,sources:acceptedSources,
    allocations:allocationPages.flat(),links,candidates,operational};
}
