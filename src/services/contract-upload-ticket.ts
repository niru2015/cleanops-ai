import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getPrivilegedSupabaseConfig } from "@/lib/supabase/privileged";

const LIFETIME_MS = 15 * 60 * 1000;
function sign(documentId: string, actorId: string, expiresAt: number) {
  return createHmac("sha256", getPrivilegedSupabaseConfig().secretKey)
    .update(`cleanops-contract-document.v1:${documentId}:${actorId}:${expiresAt}`).digest("hex");
}
export function createContractUploadTicket(documentId: string, actorId: string, now = Date.now()) {
  const expiresAt = now + LIFETIME_MS;
  return { documentId, expiresAt, signature: sign(documentId, actorId, expiresAt) };
}
export function verifyContractUploadTicket(ticket: { documentId: string; expiresAt: number; signature: string },
  actorId: string, now = Date.now()) {
  if (ticket.expiresAt <= now || ticket.expiresAt > now + LIFETIME_MS) return false;
  const expected = Buffer.from(sign(ticket.documentId, actorId, ticket.expiresAt), "hex");
  const supplied = Buffer.from(ticket.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
