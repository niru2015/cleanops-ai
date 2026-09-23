"use client";

import { useRouter } from "next/navigation";
import { useState,useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { prepareExpenseReceiptUpload,finalizeExpenseReceiptUpload } from "@/app/mobile/expenses/actions";

const accepted=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
async function digest(file:File){
  const value=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return Array.from(new Uint8Array(value),item=>item.toString(16).padStart(2,"0")).join("");
}
export function ExpenseReceiptUploader({intakeId}:{intakeId:string}){
  const router=useRouter();
  const [file,setFile]=useState<File|null>(null);
  const [notice,setNotice]=useState("");
  const [pending,startTransition]=useTransition();
  function upload(){
    if(!file)return;
    startTransition(async()=>{
      try{
        if(!accepted.has(file.type)||file.size<1||file.size>10485760)
          throw new Error("Choose a PDF or image receipt up to 10 MB.");
        const prepared=await prepareExpenseReceiptUpload({intakeId,mime:file.type,
          byteSize:file.size,sha256:await digest(file)});
        if(!prepared.ok)throw new Error(prepared.message);
        const upload=prepared.upload;
        setNotice("Uploading private receipt…");
        const stored=await createSupabaseBrowserClient().storage.from("expense-receipts")
          .uploadToSignedUrl(upload.path,upload.token,file,{contentType:file.type,upsert:false,cacheControl:"0"});
        if(stored.error)throw new Error("Receipt upload failed.");
        const finalized=await finalizeExpenseReceiptUpload({intakeId,documentId:upload.documentId,
          expiresAt:upload.expiresAt,signature:upload.signature});
        if(!finalized.ok)throw new Error(finalized.message);
        setFile(null);setNotice(finalized.message);router.refresh();
      }catch(error){setNotice(error instanceof Error?error.message:"Receipt upload failed.");}
    });
  }
  return <div><label>Receipt file <input type="file" accept=".pdf,image/jpeg,image/png,image/webp"
    onChange={event=>setFile(event.target.files?.[0]??null)}/></label>
    <button type="button" disabled={!file||pending} onClick={upload}>Upload receipt</button>
    {notice&&<p role="status">{notice}</p>}</div>;
}
