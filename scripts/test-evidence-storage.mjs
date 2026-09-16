import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const apiUrl = status.API_URL ?? status.api_url;
const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;
if (typeof apiUrl !== "string" || typeof serviceRoleKey !== "string") {
  throw new Error("Local Supabase did not return API_URL and SERVICE_ROLE_KEY.");
}

const client = createClient(apiUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const bucketName = "operational-evidence";
const { data: bucket, error: bucketError } = await client.storage.getBucket(bucketName);
if (bucketError || !bucket || bucket.public !== false) {
  throw new Error("The operational-evidence bucket is missing or public.");
}

const path = `ci/${randomUUID()}.png`;
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

try {
  const { error: uploadError } = await client.storage.from(bucketName).upload(path, bytes, {
    contentType: "image/png",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: downloaded, error: downloadError } = await client.storage
    .from(bucketName)
    .download(path);
  if (downloadError || !downloaded) throw downloadError ?? new Error("Download returned no data.");
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  if (!downloadedBytes.equals(bytes)) throw new Error("Downloaded evidence failed integrity check.");

  const { data: signed, error: signedError } = await client.storage
    .from(bucketName)
    .createSignedUrl(path, 60);
  if (signedError || !signed?.signedUrl) {
    throw signedError ?? new Error("Signed URL was not created.");
  }
} finally {
  await client.storage.from(bucketName).remove([path]);
}

console.log("Private evidence bucket upload, download, integrity and signed URL checks passed.");
