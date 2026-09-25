import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionTabs } from "@/components/ui";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getReconciliationWorkspace } from "@/integrations/finance/supabase-reconciliation";
import { reconcileFinance } from "./actions";

export const dynamic="force-dynamic";
function money(value:number,currency="CAD"){return new Intl.NumberFormat("en-CA",{style:"currency",currency}).format(value);}
function button(label:string,kind:string,periodId:string){return <form action={reconcileFinance} className="inlineAction"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="periodId" value={periodId}/><button className="reviewButton reviewButton-secondary" type="submit">{label}</button></form>;}
export default async function ReconciliationPage({searchParams}:{searchParams:Promise<{periodId?:string;notice?:string;error?:string}>}){
  const params=await searchParams;
  let loaded:Awaited<ReturnType<typeof getReconciliationWorkspace>>|null=null;
  let access:Awaited<ReturnType<typeof getAppAccessContext>>|null=null;
  let loadError:string|null=null;
  try{
    const client=await createSupabaseServerClient();access=await getAppAccessContext(client);
    if(!access.canViewFinance)throw new Error("Finance access required.");
    loaded=await getReconciliationWorkspace(client,access,params.periodId);
  }catch(error){loadError=error instanceof Error?error.message:"Reconciliation unavailable.";}
  if(!loaded||!access)return <AppShell currentPath="/finance"><section className="accessState"><h1>Reconciliation unavailable</h1><p>{loadError}</p><Link href="/finance">Finance overview</Link></section></AppShell>;
  const {sites,periods,selected,batches,sources,allocations,links,candidates,operational}=loaded;
  const siteName=new Map(access.sites.map(site=>[site.id,site.name]));
  const matchedByAllocation=new Map<string,number>();for(const link of links.filter(item=>item.state==="active"))matchedByAllocation.set(link.source_allocation_id,(matchedByAllocation.get(link.source_allocation_id)??0)+link.matched_amount);
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <SectionTabs items={getFinanceSectionTabs(access.canEditFinance)} currentPath="/finance/reconciliation" ariaLabel="Finance sections" />
    <h1>Accounting reconciliation and period close</h1>
    <p>Accepted accounting imports are the source of truth. Operational postings must be linked and balanced before a Director closes an organization-wide month.</p>
    {params.error&&<p role="alert">{params.error}</p>}{params.notice&&<p role="status">{params.notice}</p>}
    {access.canEditFinance&&<section className="reviewCard"><h2>Open a month</h2><form action={reconcileFinance}><input type="hidden" name="kind" value="open"/><label>Month <input type="month" name="month" required defaultValue={new Date().toISOString().slice(0,7)}/></label> <button className="reviewButton reviewButton-primary">Open or view period</button></form></section>}
    <section className="reviewCard"><h2>Site status</h2>{sites.length===0?<p>No finance period has been opened.</p>:<ul>{sites.map(row=><li key={`${row.period_id}-${row.site_id}`}>{row.period_start} · {siteName.get(row.site_id)??"Assigned site"} · {row.state}{row.stale?" · changed after close":""} · coverage {row.coverage} · operational {money(row.operational_amount,row.currency)} · matched {money(row.matched_amount,row.currency)} · unmatched {money(row.unmatched_amount,row.currency)} · unallocated accounting {money(row.unallocated_source_amount,row.currency)}</li>)}</ul>}</section>
    {access.canEditFinance&&<>
      <section className="reviewCard"><h2>Organization periods</h2>{periods.length===0?<p>Open a month to begin.</p>:<ul>{periods.map(row=><li key={row.period_id}><Link href={`/finance/reconciliation?periodId=${row.period_id}`}>{row.period_start}</Link> · {row.state} · close version {row.close_version}{row.stale?" · stale after posting/import change":""} · coverage {row.metrics.coverage}</li>)}</ul>}</section>
      {selected&&<>
        <section className="reviewCard"><h2>{selected.period_start} close controls</h2><p>Coverage: {selected.metrics.coverage} · {selected.metrics.completeCoverageBatches} complete accepted batches · {selected.metrics.incompleteBatches} incomplete accepted batches.</p>
          <p>Operational {money(selected.metrics.operationalAmount)} · matched {money(selected.metrics.matchedAmount)} · unmatched {money(selected.metrics.unmatchedOperationalAmount)} · unallocated accounting {money(selected.metrics.unallocatedSourceAmount)}.</p>
          <p>Ambiguous {selected.metrics.ambiguousSourceCount} · invalid source {selected.metrics.invalidSourceCount} · invalid links {selected.metrics.invalidLinkCount}. A zero balance requires complete accepted coverage.</p>
          {selected.state!=="closed"&&button("Run deterministic matching","auto",selected.period_id)} {(["open","reopened"] as string[]).includes(selected.state)&&button("Move to review","review",selected.period_id)} {selected.state==="review"&&button("Close balanced period","close",selected.period_id)}
          {selected.state==="closed"&&<form action={reconcileFinance}><input type="hidden" name="kind" value="reopen"/><input type="hidden" name="periodId" value={selected.period_id}/><label>Correction reason <input name="reason" minLength={4} required/></label> <button className="reviewButton reviewButton-secondary">Reopen</button></form>}
        </section>
        <section className="reviewCard"><h2>Accepted accounting batches</h2>{batches.length===0?<p>No accepted batch covers this month. Close is blocked.</p>:<ul>{batches.map(item=><li key={item.id}>{item.source_file_name} · {item.completeness} · {item.service_period_start} to {item.service_period_end}</li>)}</ul>}</section>
        <section className="reviewCard"><h2>Accounting allocations</h2>{allocations.length===0?<p>No accepted allocations for this month.</p>:<ul>{allocations.map(item=>{const row=sources.find(source=>source.id===item.source_row_id);const used=matchedByAllocation.get(item.id)??0;return <li key={item.id}>{row?.service_period} · {siteName.get(item.site_id)??"Site"} · {row?.category} · {money(item.amount,row?.currency)} · remaining {money(item.amount-used,row?.currency)} · allocation <code>{item.id}</code>{row?.source_document_id&&` · document ${row.source_document_id}`}</li>;})}</ul>}</section>
        <section className="reviewCard"><h2>Operational postings</h2>{operational.length===0?<p>No posted operational cost in this month.</p>:<ul>{operational.map(item=><li key={`${item.entity_type}-${item.entity_id}`}>{item.service_date} · {siteName.get(item.site_id)??"Site"} · {item.entity_type.replaceAll("_"," ")} · {item.category} · {money(item.amount,item.currency)} · remaining {money(item.amount-item.matched_amount,item.currency)} · <code>{item.entity_id}</code></li>)}</ul>}</section>
        <section className="reviewCard"><h2>Deterministic proposals</h2>{candidates.length===0?<p>No unique or ambiguous proposals remain.</p>:<ul>{candidates.map(item=><li key={`${item.source_allocation_id}-${item.operational_entity_id}`}>{item.rule} · {money(item.amount,item.currency)} · {siteName.get(item.site_id)??"Site"} · {item.ambiguous?"Ambiguous — manual review required":"Unique — ready for auto match"} · source <code>{item.source_allocation_id}</code> · operational <code>{item.operational_entity_id}</code></li>)}</ul>}</section>
        {selected.state!=="closed"&&<section className="reviewCard"><h2>Manual match or split</h2><p>Choose both records and enter an amount within their remaining balances. The database checks site, project, category, currency and period.</p><form action={reconcileFinance}><input type="hidden" name="kind" value="manual"/><input type="hidden" name="periodId" value={selected.period_id}/><label>Accounting allocation <select name="allocationId" required defaultValue=""><option value="" disabled>Choose allocation</option>{allocations.filter(item=>item.amount>(matchedByAllocation.get(item.id)??0)).map(item=>{const row=sources.find(source=>source.id===item.source_row_id);return <option key={item.id} value={item.id}>{row?.category} · {siteName.get(item.site_id)??"Site"} · {money(item.amount-(matchedByAllocation.get(item.id)??0),row?.currency)} remaining · {item.id.slice(0,8)}</option>;})}</select></label> <label>Operational record <select name="entity" required defaultValue=""><option value="" disabled>Choose posting</option>{operational.filter(item=>item.amount>item.matched_amount).map(item=><option key={`${item.entity_type}-${item.entity_id}`} value={`${item.entity_type}:${item.entity_id}`}>{item.entity_type.replaceAll("_"," ")} · {siteName.get(item.site_id)??"Site"} · {money(item.amount-item.matched_amount,item.currency)} remaining · {item.entity_id.slice(0,8)}</option>)}</select></label> <label>Amount <input name="amount" type="number" min="0.01" step="0.01" required/></label> <label>Reason <input name="reason" minLength={4} required/></label> <button className="reviewButton reviewButton-primary">Link amount</button></form></section>}
        <section className="reviewCard"><h2>Match audit</h2>{links.length===0?<p>No match decisions yet.</p>:<ul>{links.map(item=><li key={item.id}>{item.state} · {item.match_rule} · {money(item.matched_amount)} · {item.rationale} · {item.linked_at}{item.state==="active"&&selected.state!=="closed"&&<form action={reconcileFinance}><input type="hidden" name="kind" value="void"/><input type="hidden" name="periodId" value={selected.period_id}/><input type="hidden" name="linkId" value={item.id}/><label>Correction reason <input name="reason" minLength={4} required/></label> <button className="reviewButton reviewButton-secondary">Void match</button></form>}</li>)}</ul>}</section>
      </>}
    </>}
  </AppShell>;
}
