import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MockMessage } from "@/schemas/mock-message";
import type { AcceptEnvelopeInput, ClaimedJob, IngressRepository } from "@/services/ingress-repository";
import { handleWhatsAppPost } from "@/services/whatsapp-webhook";
import { WhatsAppMediaClient, WhatsAppMediaError } from "@/services/whatsapp-media";
import { processNextWhatsAppReply, type ClaimedWhatsAppReply, type WhatsAppOutboxRepository } from "@/services/whatsapp-outbox";

const secret = "test-app-secret-at-least-24-characters";
const payload = {
  object: "whatsapp_business_account",
  entry: [{ id: "waba-1", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: "phone-1" },
    messages: [{ id: "wamid.inbound-1", from: "15551234567", timestamp: "1789580000", type: "image", image: { id: "media-1", mime_type: "image/jpeg" } }],
    statuses: [{ id: "wamid.outbound-1", status: "delivered", timestamp: "1789580001", recipient_id: "15551234567" }],
  } }] }],
};

class FakeIngress implements IngressRepository {
  keys = new Set<string>(); inputs: AcceptEnvelopeInput[] = [];
  async acceptEnvelope(input: AcceptEnvelopeInput) { this.inputs.push(input); const duplicate = this.keys.has(input.dedupeKey); this.keys.add(input.dedupeKey); return { eventId: "event", jobId: "job", duplicate }; }
  async claimJob(): Promise<ClaimedJob | null> { return null; }
  async completeJob(_jobId: string, _workerId: string, messages: MockMessage[]) { return { insertedCount: messages.length, messageCount: messages.length }; }
  async failJob(): Promise<"pending"> { return "pending"; }
  async retryFailedJob() { return true; }
}

function signedRequest(value: unknown, valid = true) {
  const body = JSON.stringify(value);
  const signature = createHmac("sha256", valid ? secret : `${secret}-wrong`).update(body).digest("hex");
  return new Request("https://cleanops.example/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": `sha256=${signature}` } });
}

describe("CLEAN-009 WhatsApp Business adapter", () => {
  it("verifies raw bytes, normalizes media, records transport status, and dedupes replay", async () => {
    const ingress = new FakeIngress(); const statuses: unknown[] = [];
    const statusRepository = { async recordStatuses(account: string, values: unknown[]) { statuses.push({ account, values }); } };
    expect((await handleWhatsAppPost(signedRequest(payload), ingress, statusRepository, secret)).status).toBe(200);
    const replay = await handleWhatsAppPost(signedRequest(payload), ingress, statusRepository, secret);
    expect(await replay.json()).toMatchObject({ duplicateCount: 1, statusCount: 1 });
    expect(ingress.inputs[0]?.payload).toMatchObject({ accountExternalId: "phone-1", messages: [{ externalMessageId: "wamid.inbound-1", senderId: "15551234567", mediaRefs: [{ externalId: "media-1", contentType: "image/jpeg" }] }] });
    expect(statuses).toHaveLength(2);
  });

  it("rejects a forged signature before persistence", async () => {
    const ingress = new FakeIngress();
    const response = await handleWhatsAppPost(signedRequest(payload, false), ingress, { async recordStatuses() {} }, secret);
    expect(response.status).toBe(401); expect(ingress.inputs).toHaveLength(0);
  });

  it("downloads only an authenticated allowlisted media URL", async () => {
    const calls: string[] = [];
    const client = new WhatsAppMediaClient("token", "v23.0", async (input) => {
      calls.push(String(input));
      return calls.length === 1
        ? new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/1", mime_type: "image/jpeg", file_size: 3 }))
        : new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    });
    expect((await client.download("media-1")).bytes).toEqual(new Uint8Array([1, 2, 3]));
    const unsafe = new WhatsAppMediaClient("token", "v23.0", async () => new Response(JSON.stringify({ url: "https://evil.example/file", mime_type: "image/jpeg" })));
    await expect(unsafe.download("media-1")).rejects.toMatchObject<Partial<WhatsAppMediaError>>({ code: "unsafe_url" });
  });

  it("marks one logical outbox item sent with the provider message ID", async () => {
    let claimed = false; const sent: string[] = [];
    const reply: ClaimedWhatsAppReply = { outboxId: "outbox-1", phoneNumberId: "phone-1", recipientId: "15551234567", payload: { type: "text", text: "Reply" }, attemptCount: 1 };
    const repository: WhatsAppOutboxRepository = {
      async claim() { if (claimed) return null; claimed = true; return reply; },
      async markSent(_id, _worker, providerId) { sent.push(providerId); },
      async fail() { return "pending"; },
    };
    const fetchImpl = async () => new Response(JSON.stringify({ messages: [{ id: "wamid.sent-1" }] }), { status: 200 });
    expect(await processNextWhatsAppReply(repository, { workerId: "worker", leaseSeconds: 60, accessToken: "token", graphVersion: "v23.0", fetchImpl })).toMatchObject({ status: "sent" });
    expect(await processNextWhatsAppReply(repository, { workerId: "worker", leaseSeconds: 60, accessToken: "token", graphVersion: "v23.0", fetchImpl })).toEqual({ status: "idle" });
    expect(sent).toEqual(["wamid.sent-1"]);
  });
});
