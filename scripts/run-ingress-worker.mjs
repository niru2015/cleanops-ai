const token = process.env.CLEANOPS_DEMO_INGRESS_TOKEN;
const baseUrl = process.env.CLEANOPS_APP_URL ?? "http://127.0.0.1:3000";
const workerId = process.env.CLEANOPS_DEMO_WORKER_ID ?? "cleanops-local-worker";
const retryJobId = process.argv[2] === "--retry" ? process.argv[3] : undefined;
const reconcileEvidence = process.argv[2] === "--reconcile-evidence";

if (!token || token.length < 24) {
  console.error("Set CLEANOPS_DEMO_INGRESS_TOKEN to the same local demo token as the app.");
  process.exit(1);
}

if (process.argv[2] === "--retry" && !retryJobId) {
  console.error("Usage: npm run worker:messages -- --retry <job-id>");
  process.exit(1);
}

const body = reconcileEvidence
  ? { limit: 20 }
  : retryJobId
    ? { action: "retry", jobId: retryJobId }
    : { action: "process", workerId, leaseSeconds: 60 };
const endpoint = reconcileEvidence
  ? "/api/demo/evidence/reconcile"
  : "/api/demo/messages/worker";

let response;
try {
  response = await fetch(new URL(endpoint, baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
} catch {
  console.error("The CleanOps local app could not be reached.");
  process.exit(1);
}

const result = await response.json().catch(() => ({ error: "invalid_response" }));
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
