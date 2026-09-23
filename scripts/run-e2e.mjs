import { execFileSync, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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
const demoPassword = "cleanops-local-e2e-2026";
const demoEmail = "director.e2e@cleanops.example.com";
const environment = {
  ...process.env,
  NEXT_PUBLIC_APP_MODE: "prototype",
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SECRET_KEY: secretKey,
  CLEANOPS_E2E_EMAIL: demoEmail,
  CLEANOPS_DEMO_PASSWORD: demoPassword,
  CLEANOPS_HOSTED_DEMO_ENABLED: "true",
  CLEANOPS_DEMO_INGRESS_ENABLED: "true",
  CLEANOPS_DEMO_INGRESS_TOKEN: "cleanops-browser-e2e-token-2026",
  CLEANOPS_DEMO_WORKER_ID: "cleanops-browser-e2e-worker",
};

const admin = createClient(apiUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
if (listed.error) throw listed.error;
let user = listed.data.users.find((candidate) => candidate.email === demoEmail);
if (user) {
  const updated = await admin.auth.admin.updateUserById(user.id, {
    password: demoPassword,
    email_confirm: true,
    user_metadata: { cleanops_demo: true, display_name: "E2E Director", persona: "Director" },
  });
  if (updated.error) throw updated.error;
} else {
  const created = await admin.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { cleanops_demo: true, display_name: "E2E Director", persona: "Director" },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("Could not create the E2E Director.");
  user = created.data.user;
}
const membership = await admin
  .from("memberships")
  .update({ user_id: user.id })
  .eq("id", "20000000-0000-4000-8000-000000000001");
if (membership.error) throw membership.error;

const run = spawnSync(command, ["playwright", "test", "--project=chromium", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: environment,
});
process.exit(run.status ?? 1);
