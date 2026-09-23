"use client";
import { useRouter } from "next/navigation";
import { useState,useTransition } from "react";
import { approveExpense } from "@/app/finance/expenses/actions";
export function ExpenseApproval({claimId}:{claimId:string}){
  const router=useRouter();const [pending,startTransition]=useTransition();const [message,setMessage]=useState("");
  return <><button type="button" disabled={pending} onClick={()=>startTransition(async()=>{
    const result=await approveExpense(claimId);setMessage(result.message);router.refresh();
  })}>Director approve and post</button>{message&&<p role="status">{message}</p>}</>;
}
