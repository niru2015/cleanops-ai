const token = process.env.CLEANOPS_DEMO_INGRESS_TOKEN;
const baseUrl = process.env.CLEANOPS_APP_URL ?? "http://127.0.0.1:3000";
const workerId = process.env.CLEANOPS_DEMO_WORKER_ID ?? "cleanops-local-worker";
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

if (!token || token.length < 24) {
  console.error("Set CLEANOPS_DEMO_INGRESS_TOKEN to the same local demo token as the app.");
  process.exit(1);
}

async function post(path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: "invalid_response" }));
  if (!response.ok) throw new Error(`${path} failed: ${JSON.stringify(result)}`);
  return result;
}

await post("/api/demo/messages", {
  schemaVersion: 1,
  eventId: "clean-004-golden-replay",
  entries: [
    {
      accountExternalId: "demo-nightshift-group",
      messages: [
        {
          externalMessageId: "golden-before-2315",
          externalThreadId: "restroom-b-thread",
          senderId: "worker-182",
          occurredAt: "2026-09-14T06:15:00Z",
          text: "#before Restroom B",
          mediaRefs: [{ externalId: "golden-media-before", contentType: "image/png" }],
          schemaVersion: 1,
        },
        {
          externalMessageId: "golden-after-2329",
          externalThreadId: "restroom-b-thread",
          senderId: "worker-182",
          occurredAt: "2026-09-14T06:29:00Z",
          text: "#after Restroom B",
          mediaRefs: [{ externalId: "golden-media-after", contentType: "image/png" }],
          schemaVersion: 1,
        },
      ],
    },
  ],
});

for (let attempt = 0; attempt < 20; attempt += 1) {
  const result = await post("/api/demo/messages/worker", {
    action: "process",
    workerId,
    leaseSeconds: 60,
  });
  if (result.status === "idle") break;
}

const before = await post("/api/demo/evidence", {
  accountExternalId: "demo-nightshift-group",
  externalMessageId: "golden-before-2315",
  mediaExternalId: "golden-media-before",
  declaredContentType: "image/png",
  contentBase64: pngBase64,
});
const after = await post("/api/demo/evidence", {
  accountExternalId: "demo-nightshift-group",
  externalMessageId: "golden-after-2329",
  mediaExternalId: "golden-media-after",
  declaredContentType: "image/png",
  contentBase64: pngBase64,
});

console.log(JSON.stringify({ before, after }, null, 2));
