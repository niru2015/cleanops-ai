import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMobileUploadTicket,
  verifyMobileUploadTicket,
} from "@/services/mobile-upload-ticket";

const evidenceId = "81000000-0000-4000-8000-000000000004";
const actorId = "00000000-0000-4000-8000-000000000011";
const now = 1_800_000_000_000;

describe("mobile upload tickets", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://cleanops-test.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-key-with-at-least-twenty-characters");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("binds a short-lived upload to its evidence and actor", () => {
    const ticket = createMobileUploadTicket(evidenceId, actorId, now);
    expect(verifyMobileUploadTicket(ticket, actorId, now + 1)).toBe(true);
    expect(verifyMobileUploadTicket(ticket, "00000000-0000-4000-8000-000000000012", now + 1)).toBe(false);
  });

  it("rejects expired, future-issued, and tampered tickets", () => {
    const ticket = createMobileUploadTicket(evidenceId, actorId, now);
    expect(verifyMobileUploadTicket(ticket, actorId, ticket.expiresAt)).toBe(false);
    expect(verifyMobileUploadTicket(ticket, actorId, now - 1)).toBe(false);
    const firstCharacter = ticket.signature[0] === "0" ? "1" : "0";
    expect(verifyMobileUploadTicket({ ...ticket, signature: `${firstCharacter}${ticket.signature.slice(1)}` }, actorId, now + 1)).toBe(false);
  });
});
