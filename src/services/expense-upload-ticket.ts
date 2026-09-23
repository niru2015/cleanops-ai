import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPrivilegedSupabaseConfig } from "@/lib/supabase/privileged";

const lifetime = 15 * 60 * 1000;
function sign(documentId:string,actorId:string,expiresAt:number){
  return createHmac("sha256",getPrivilegedSupabaseConfig().secretKey)
    .update(`cleanops-expense-receipt.v1:${documentId}:${actorId}:${expiresAt}`).digest("hex");
}
export function createExpenseUploadTicket(documentId:string,actorId:string,now=Date.now()){
  const expiresAt=now+lifetime;
  return {documentId,expiresAt,signature:sign(documentId,actorId,expiresAt)};
}
export function verifyExpenseUploadTicket(ticket:{documentId:string;expiresAt:number;signature:string},actorId:string,now=Date.now()){
  if(ticket.expiresAt<=now||ticket.expiresAt>now+lifetime||!/^[0-9a-f]{64}$/.test(ticket.signature))return false;
  const expected=Buffer.from(sign(ticket.documentId,actorId,ticket.expiresAt),"hex");
  const supplied=Buffer.from(ticket.signature,"hex");
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
