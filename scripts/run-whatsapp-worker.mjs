const token = process.env.WHATSAPP_WORKER_TOKEN;
const baseUrl = process.env.CLEANOPS_APP_URL ?? "http://127.0.0.1:3000";
const retryEvidenceId = process.argv[2] === "--retry-evidence" ? process.argv[3] : undefined;

if (!token || token.length < 24) {
  console.error("Set WHATSAPP_WORKER_TOKEN to the same server-only value as the app.");
  process.exit(1);
}
if (process.argv[2] === "--retry-evidence" && !retryEvidenceId) {
  console.error("Usage: npm run worker:whatsapp -- --retry-evidence <evidence-id>");
  process.exit(1);
}

let response;
try {
  response = await fetch(new URL("/api/internal/whatsapp/worker", baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(retryEvidenceId ? { retryEvidenceId } : {}),
  });
} catch {
  console.error("The CleanOps app could not be reached.");
  process.exit(1);
}

const result = await response.json().catch(() => ({ error: "invalid_response" }));
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
