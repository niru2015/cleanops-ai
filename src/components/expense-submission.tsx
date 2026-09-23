"use client";

import { useState,useTransition } from "react";
import { submitAppExpense } from "@/app/mobile/expenses/actions";
import { ExpenseReceiptUploader } from "@/components/expense-receipt-uploader";

export function ExpenseSubmission({sites}:{sites:{id:string;name:string}[]}){
  const [siteId,setSiteId]=useState(sites[0]?.id??"");
  const [details,setDetails]=useState("");
  const [intakeId,setIntakeId]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [pending,startTransition]=useTransition();
  function submit(){
    startTransition(async()=>{
      const result=await submitAppExpense({siteId,text:details});
      setNotice(result.message);
      if(result.ok)setIntakeId(result.intakeId);
    });
  }
  return <section><h2>Submit an expense</h2>
    <p>Describe the expense and attach its receipt. Finance will verify site, category and amount before posting.</p>
    <label>Casino <select value={siteId} onChange={event=>setSiteId(event.target.value)}>
      {sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
    <label>Expense details <textarea value={details} onChange={event=>setDetails(event.target.value)}
      placeholder="Expense: fuel; Vendor: Demo Fuel; Date: 2026-09-01; Total: CAD $42.00; Payment: employee personal"/></label>
    {!intakeId&&<button type="button" disabled={pending||!siteId||details.trim().length<4} onClick={submit}>Submit expense</button>}
    {notice&&<p role="status">{notice}</p>}
    {intakeId&&<ExpenseReceiptUploader intakeId={intakeId}/>}
  </section>;
}
