import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getPrivilegedSupabaseConfig } from "@/lib/supabase/privileged";

const TICKET_LIFETIME_MS = 15 * 60 * 1000;

function payload(evidenceId: string, actorUserId: string, expiresAt: number) {
  return `cleanops-mobile-upload.v1:${evidenceId}:${actorUserId}:${expiresAt}`;
}

function signatureFor(evidenceId: string, actorUserId: string, expiresAt: number) {
  return createHmac("sha256", getPrivilegedSupabaseConfig().secretKey)
    .update(payload(evidenceId, actorUserId, expiresAt))
    .digest("hex");
}

export function createMobileUploadTicket(
  evidenceId: string,
  actorUserId: string,
  now = Date.now(),
) {
  const expiresAt = now + TICKET_LIFETIME_MS;
  return {
    evidenceId,
    expiresAt,
    signature: signatureFor(evidenceId, actorUserId, expiresAt),
  };
}

export function verifyMobileUploadTicket(
  ticket: { evidenceId: string; expiresAt: number; signature: string },
  actorUserId: string,
  now = Date.now(),
) {
  if (ticket.expiresAt <= now || ticket.expiresAt > now + TICKET_LIFETIME_MS) return false;
  const expected = signatureFor(ticket.evidenceId, actorUserId, ticket.expiresAt);
  const suppliedBytes = Buffer.from(ticket.signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}
