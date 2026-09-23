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
  CLEANOPS_E2E_AREA_EMAIL: "area.e2e@cleanops.example.com",
  CLEANOPS_E2E_SUPERVISOR_EMAIL: "supervisor.e2e@cleanops.example.com",
  CLEANOPS_E2E_OPERATIONS_EMAIL: "operations.e2e@cleanops.example.com",
  CLEANOPS_E2E_CLEANER_EMAIL: "cleaner.e2e@cleanops.example.com",
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

for (const persona of [
  { email: environment.CLEANOPS_E2E_AREA_EMAIL, name: "E2E Area Manager", membershipId: "20000000-0000-4000-8000-000000000003", role: "area_manager" },
  { email: environment.CLEANOPS_E2E_SUPERVISOR_EMAIL, name: "E2E Supervisor", membershipId: "20000000-0000-4000-8000-000000000008", role: "site_supervisor" },
  { email: environment.CLEANOPS_E2E_OPERATIONS_EMAIL, name: "E2E Operations Manager", membershipId: "20000000-0000-4000-8000-000000000007", role: "operations_manager" },
  { email: environment.CLEANOPS_E2E_CLEANER_EMAIL, name: "E2E Cleaner", membershipId: "20000000-0000-4000-8000-000000000004", role: "cleaner" },
]) {
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (users.error) throw users.error;
  let person = users.data.users.find((candidate) => candidate.email === persona.email);
  if (person) {
    const updated = await admin.auth.admin.updateUserById(person.id, { password: demoPassword, email_confirm: true });
    if (updated.error) throw updated.error;
  } else {
    const created = await admin.auth.admin.createUser({ email: persona.email, password: demoPassword,
      email_confirm: true, user_metadata: { cleanops_demo: true, display_name: persona.name } });
    if (created.error || !created.data.user) throw created.error ?? new Error("Could not create the E2E persona.");
    person = created.data.user;
  }
  if (persona.role === "area_manager" || persona.role === "cleaner") {
    const update = await admin.from("memberships").update({ user_id: person.id }).eq("id", persona.membershipId);
    if (update.error) throw update.error;
  } else {
    const upsert = await admin.from("memberships").upsert({ id: persona.membershipId,
      organization_id: "10000000-0000-4000-8000-000000000001", user_id: person.id,
      role: persona.role }, { onConflict: "id" });
    if (upsert.error) throw upsert.error;
  }
}

const supervisorSiteAccess = await admin.from("member_site_access").upsert({
  id: "41000000-0000-4000-8000-000000000008",
  organization_id: "10000000-0000-4000-8000-000000000001",
  membership_id: "20000000-0000-4000-8000-000000000008",
  site_id: "40000000-0000-4000-8000-000000000001",
  starts_at: "2026-01-01T00:00:00Z",
}, { onConflict: "id" });
if (supervisorSiteAccess.error) throw supervisorSiteAccess.error;

const run = spawnSync(command, ["playwright", "test", "--project=chromium", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: environment,
});
process.exit(run.status ?? 1);
