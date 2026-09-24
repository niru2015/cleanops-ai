"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState,useTransition } from "react";
import { rejectExpense,resolveExpense,suggestExpense } from "@/app/finance/expenses/actions";
import { ExpenseReceiptUploader } from "@/components/expense-receipt-uploader";
import type { ExpenseClaim,ExpenseDocument,ExpenseIntake } from "@/integrations/finance/supabase-expenses";
import { formatUtcTimestamp } from "@/lib/format-utc-timestamp";

const categories=["meals","fuel_travel","supplies","equipment_purchase","equipment_repair",
  "parking_tolls","contractor","other_direct"] as const;
const methods=["employee_personal","company_card","company_cash","supplier_invoice","other"] as const;
function hint(value:unknown){return typeof value==="string"||typeof value==="number"?String(value):"";}
export function ExpenseInbox({intakes,documents,claims,sites}:{intakes:ExpenseIntake[];
  documents:ExpenseDocument[];claims:ExpenseClaim[];sites:{id:string;name:string}[]}){
  const router=useRouter();
  const [notice,setNotice]=useState("");
  const [pending,startTransition]=useTransition();
  const [drafts,setDrafts]=useState<Record<string,Record<string,string>>>({});
  function field(item:ExpenseIntake,key:string,initial:string){return drafts[item.id]?.[key]??initial;}
  function change(id:string,key:string,value:string){setDrafts(old=>({...old,[id]:{...old[id],[key]:value}}));}
  function run(action:()=>Promise<{ok:boolean;message:string}>){
    startTransition(async()=>{const result=await action();setNotice(result.message);router.refresh();});
  }
  return <section><h2>Finance Inbox</h2>
    <p>Messages and receipts are source evidence. Suggested fields need human review; only a Director can post cost.</p>
    {notice&&<p role="status">{notice}</p>}
    {intakes.length===0&&<p>No finance candidates are visible for your assigned casinos.</p>}
    {intakes.map(item=>{
      const proposal=item.proposed;
      const docs=documents.filter(d=>d.intake_id===item.id);
      const claim=claims.find(c=>c.intake_id===item.id);
      const exact=docs.some(d=>d.sha256&&claims.some(c=>c.receipt_sha256===d.sha256&&c.id!==claim?.id&&c.status==="posted"));
      const similar=claim&&claims.some(c=>c.id!==claim.id&&c.vendor.toLowerCase()===claim.vendor.toLowerCase()
        &&c.expense_date===claim.expense_date&&Math.abs(c.total-claim.total)<=0.01);
      const total=field(item,"total",hint(proposal.total));
      const siteId=field(item,"siteId",item.site_id??"");
      return <article className="reviewCard" key={item.id} id={item.id}>
        <h3>{item.source_kind==="whatsapp"?"WhatsApp":"App"} candidate · {item.review_state.replaceAll("_"," ")}</h3>
        <p>Source text (untrusted): <span>{item.source_text}</span></p>
        <p>Received {formatUtcTimestamp(item.created_at)}</p>
        <button type="button" disabled={pending||["posted","rejected"].includes(item.review_state)}
          onClick={()=>run(()=>suggestExpense(item.id))}>Suggest fields from source</button>
        {item.extraction_state==="suggested"&&<p>Machine suggestion: <code>{JSON.stringify(proposal)}</code></p>}
        {docs.length===0?<p>Receipt missing. Approval requires a verified receipt.</p>:<ul>{docs.map(doc=><li key={doc.id}>
          Receipt {doc.status}{doc.sha256?` · SHA-256 ${doc.sha256.slice(0,12)}…`:""}
          {doc.status==="ready"&&<> · <a href={`/api/finance/expenses/documents/${doc.id}/download`}>Open source receipt</a></>}
        </li>)}</ul>}
        {exact&&<p role="alert">Exact receipt already posted from another message. This claim cannot post twice.</p>}
        {similar&&<p role="alert">Possible duplicate: vendor, date and amount match another claim. Review the receipts.</p>}
        {item.review_state!=="posted"&&item.review_state!=="rejected"&&<>
          <ExpenseReceiptUploader intakeId={item.id}/>
          <div className="financeGrid">
            <label>Casino <select value={siteId} onChange={e=>change(item.id,"siteId",e.target.value)}>
              <option value="">Select casino</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Category <select value={field(item,"category",hint(proposal.category))}
              onChange={e=>change(item.id,"category",e.target.value)}><option value="">Select category</option>
              {categories.map(c=><option key={c} value={c}>{c.replaceAll("_"," ")}</option>)}</select></label>
            <label>Vendor <input value={field(item,"vendor",hint(proposal.vendor))}
              onChange={e=>change(item.id,"vendor",e.target.value)}/></label>
            <label>Date <input type="date" value={field(item,"expenseDate",hint(proposal.expenseDate))}
              onChange={e=>change(item.id,"expenseDate",e.target.value)}/></label>
            <label>Total <input inputMode="decimal" value={total}
              onChange={e=>change(item.id,"total",e.target.value)}/></label>
            <label>Subtotal (blank if unknown) <input inputMode="decimal" value={field(item,"subtotal",hint(proposal.subtotal))}
              onChange={e=>change(item.id,"subtotal",e.target.value)}/></label>
            <label>Tax (blank if unknown) <input inputMode="decimal" value={field(item,"tax",hint(proposal.tax))}
              onChange={e=>change(item.id,"tax",e.target.value)}/></label>
            <label>Currency <input value={field(item,"currency",hint(proposal.currency)||"CAD")}
              onChange={e=>change(item.id,"currency",e.target.value)}/></label>
            <label>Payment <select value={field(item,"paymentMethod",hint(proposal.paymentMethod))}
              onChange={e=>change(item.id,"paymentMethod",e.target.value)}><option value="">Select payment</option>
              {methods.map(m=><option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}</select></label>
            <label>Project reference (optional) <input value={field(item,"projectReference",hint(proposal.projectReference))}
              onChange={e=>change(item.id,"projectReference",e.target.value)}/></label>
            <label>Description <input value={field(item,"description",item.source_text.slice(0,300))}
              onChange={e=>change(item.id,"description",e.target.value)}/></label>
            <label>Second allocation casino (optional) <select value={field(item,"splitSiteId","")}
              onChange={e=>change(item.id,"splitSiteId",e.target.value)}><option value="">No split</option>
              {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Second allocation amount <input inputMode="decimal" value={field(item,"splitAmount","")}
              onChange={e=>change(item.id,"splitAmount",e.target.value)}/></label>
            <label>Review reason or correction <input value={field(item,"reason","")}
              onChange={e=>change(item.id,"reason",e.target.value)}/></label>
          </div>
          {proposal.total!=null&&total&&Number(total)!==Number(proposal.total)&&
            <p>Human total differs from the suggestion. Record a review reason before Director approval.</p>}
          <button type="button" disabled={pending} onClick={()=>{
            const splitSiteId=field(item,"splitSiteId","");
            const splitAmount=Number(field(item,"splitAmount",""));
            const allocations=splitSiteId&&splitAmount>0?[{siteId,amount:Number(total)-splitAmount,
              projectReference:field(item,"projectReference","")||null},
              {siteId:splitSiteId,amount:splitAmount,projectReference:null}]:null;
            run(()=>resolveExpense({intakeId:item.id,siteId,category:field(item,"category",hint(proposal.category)),
              vendor:field(item,"vendor",hint(proposal.vendor)),expenseDate:field(item,"expenseDate",hint(proposal.expenseDate)),
              paymentMethod:field(item,"paymentMethod",hint(proposal.paymentMethod)),
              currency:field(item,"currency",hint(proposal.currency)||"CAD"),
              subtotal:field(item,"subtotal",hint(proposal.subtotal))?Number(field(item,"subtotal",hint(proposal.subtotal))):null,
              tax:field(item,"tax",hint(proposal.tax))?Number(field(item,"tax",hint(proposal.tax))):null,
              total:Number(total),description:field(item,"description",item.source_text.slice(0,300)),
              contractId:null,projectReference:field(item,"projectReference","")||null,
              allocations,reason:field(item,"reason","")||null}));
          }}>Save reviewed expense</button>
          <button type="button" disabled={pending} onClick={()=>{
            const reason=field(item,"reason","");run(()=>rejectExpense({intakeId:item.id,reason}));
          }}>Reject with reason</button>
        </>}
        {claim&&<p>Claim {claim.status} · {claim.currency} {claim.total.toFixed(2)} · <Link href={`/finance/expenses#${claim.id}`}>Expense provenance</Link></p>}
      </article>;
    })}
  </section>;
}
