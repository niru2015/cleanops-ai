import "server-only";
import { z } from "zod";

const metadataSchema = z.object({ url: z.url(), mime_type: z.string().max(120), file_size: z.number().int().nonnegative().optional() }).passthrough();

export class WhatsAppMediaError extends Error {
  constructor(readonly code: "metadata_failed" | "unsafe_url" | "download_failed" | "too_large") { super(code); }
}

export class WhatsAppMediaClient {
  constructor(private readonly accessToken: string, private readonly graphVersion: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async download(mediaId: string) {
    const metadataResponse = await this.fetchImpl(`https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!metadataResponse.ok) throw new WhatsAppMediaError("metadata_failed");
    const metadata = metadataSchema.safeParse(await metadataResponse.json());
    if (!metadata.success || (metadata.data.file_size ?? 0) > 10 * 1024 * 1024) throw new WhatsAppMediaError(metadata.success ? "too_large" : "metadata_failed");
    const url = new URL(metadata.data.url);
    if (url.protocol !== "https:" || url.hostname !== "lookaside.fbsbx.com") throw new WhatsAppMediaError("unsafe_url");
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new WhatsAppMediaError("download_failed");
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > 10 * 1024 * 1024) throw new WhatsAppMediaError("too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 10 * 1024 * 1024) throw new WhatsAppMediaError("too_large");
    return { bytes, contentType: response.headers.get("content-type") ?? metadata.data.mime_type };
  }
}
