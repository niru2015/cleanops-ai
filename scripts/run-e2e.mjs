import { execFileSync, spawnSync } from "node:child_process";

const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const apiUrl = status.API_URL ?? status.api_url;
const publishableKey = status.ANON_KEY ?? status.anon_key ?? status.PUBLISHABLE_KEY;
const secretKey = status.SERVICE_ROLE_KEY ?? status.service_role_key ?? status.SECRET_KEY;
if (![apiUrl, publishableKey, secretKey].every((value) => typeof value === "string" && value.length > 20)) {
  throw new Error("Local Supabase did not return the API URL and local API keys.");
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const run = spawnSync(command, ["playwright", "test", "--project=chromium"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_APP_MODE: "prototype",
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    CLEANOPS_DEMO_INGRESS_ENABLED: "true",
    CLEANOPS_DEMO_INGRESS_TOKEN: "cleanops-browser-e2e-token-2026",
    CLEANOPS_DEMO_WORKER_ID: "cleanops-browser-e2e-worker",
  },
});
process.exit(run.status ?? 1);
