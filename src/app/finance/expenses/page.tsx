import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ExpenseApproval } from "@/components/expense-approval";
import { SectionTabs } from "@/components/ui";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import { getExpenseWorkspace } from "@/integrations/finance/supabase-expenses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic="force-dynamic";
export default async function ExpensesPage(){
  const loaded=await (async()=>{try{
    const client=await createSupabaseServerClient();
    const access=await getAppAccessContext(client);
    if(!access.canViewFinance)throw new Error("restricted");
    const data=await getExpenseWorkspace(client,access);
    return {access,data};
  }catch{return null;}})();
  if(!loaded)return <AppShell currentPath="/finance"><section className="accessState"><h1>Expenses unavailable</h1>
    <p>Director or assigned Area Manager access is required.</p></section></AppShell>;
  const {access,data}=loaded;
  const siteNames=new Map(access.sites.map(site=>[site.id,site.name]));
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
      <SectionTabs items={getFinanceSectionTabs(access.canEditFinance)} currentPath="/finance/expenses" ariaLabel="Finance sections" />
      <h1>Expenses and approved direct cost</h1>
      <p>Approved expense postings are operational costs. Reimbursement status is separate from the expense.</p>
      {data.claims.length===0&&<p>No reviewed expenses are visible for your assigned casinos.</p>}
      {data.claims.map(claim=>{
        const source=data.intakes.find(item=>item.id===claim.intake_id);
        const documents=data.documents.filter(document=>document.intake_id===claim.intake_id);
        const allocations=data.allocations.filter(allocation=>allocation.claim_id===claim.id);
        const postings=data.postings.filter(posting=>posting.claim_id===claim.id);
        const events=data.audits.filter(event=>event.claim_id===claim.id);
        return <article className="reviewCard" key={claim.id} id={claim.id}>
          <h2>{claim.vendor} · {claim.category.replaceAll("_"," ")} · {claim.currency} {claim.total.toFixed(2)}</h2>
          <p>{siteNames.get(claim.site_id)??"Restricted site"} · {claim.expense_date} · {claim.status}</p>
          <p>Payment: {claim.payment_method.replaceAll("_"," ")} · reimbursement: {claim.reimbursement_status.replaceAll("_"," ")}</p>
          <p>Subtotal: {claim.subtotal==null?"unknown":claim.subtotal.toFixed(2)} · Tax: {claim.tax==null?"unknown":claim.tax.toFixed(2)}</p>
          {claim.asset_review_required&&<p role="alert">Equipment purchase: accounting and asset review required. CleanOps has not decided capitalization.</p>}
          {claim.project_reference&&<p>Project reference: {claim.project_reference}</p>}
          <p>Original {source?.source_kind??"source"} message: {source?.source_text??"Unavailable"}</p>
          <p>Human review reason: {claim.review_reason??"none recorded"}</p>
          <ul>{documents.map(doc=><li key={doc.id}>Receipt {doc.status}
            {doc.sha256?` · SHA-256 ${doc.sha256}`:""}
            {doc.status==="ready"&&<> · <a href={`/api/finance/expenses/documents/${doc.id}/download`}>Open original</a></>}
          </li>)}</ul>
          <h3>Site and project allocations</h3><ul>{allocations.map(a=><li key={a.id}>
            {siteNames.get(a.site_id)??"Restricted site"}{a.project_reference?` · ${a.project_reference}`:""} · {claim.currency} {a.amount.toFixed(2)}
          </li>)}</ul>
          <h3>Recognized cost postings</h3><ul>{postings.map(p=><li key={p.id}>
            {siteNames.get(p.site_id)??"Restricted site"} · {p.category.replaceAll("_"," ")} · {p.currency} {p.amount.toFixed(2)} · {p.posted_at}
          </li>)}</ul>
          <h3>Approval provenance</h3><ul>{events.map(event=><li key={event.id}>
            {event.event_kind} · {event.created_at} · actor {event.actor_id??"system"}
            {event.reason?` · ${event.reason}`:""}
          </li>)}</ul>
          {claim.approved_at&&<p>Director approval: {claim.approved_at} · {claim.approved_by}</p>}
          {claim.status==="submitted"&&access.canEditFinance&&<ExpenseApproval claimId={claim.id}/>}
          {source&&<p><Link href={`/finance/inbox#${source.id}`}>Review source candidate</Link></p>}
        </article>;
      })}
    </AppShell>;
}
