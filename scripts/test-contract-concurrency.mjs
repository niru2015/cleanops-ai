import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const url = status.API_URL;
const dbUrl = status.DB_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url ?? "") ||
  !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname)) {
  throw new Error("Concurrent activation test requires local Supabase.");
}
const admin = createClient(url, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const membership = await admin.from("memberships").select("user_id")
  .eq("id", "20000000-0000-4000-8000-000000000001").single();
if (membership.error || !membership.data?.user_id) throw new Error("Local Director membership is missing.");
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const signed = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: membership.data.user_id,
  role: "authenticated", aud: "authenticated", iss: "supabase", iat: now, exp: now + 600 })}`;
const token = `${signed}.${createHmac("sha256", status.JWT_SECRET).update(signed).digest("base64url")}`;
const actor = () => createClient(url, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});
const siteId = "40000000-0000-4000-8000-000000000001";
let contractId;
let versionId;
async function checked(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
try {
  contractId = await checked(actor().rpc("create_manual_contract", {
    p_site_id: siteId, p_code: `C22-RACE-${Date.now()}`,
    p_name: "Synthetic concurrent activation test" }), "Create contract");
  const version = await checked(admin.from("contract_versions").select("id,organization_id")
    .eq("contract_id", contractId).single(), "Read version");
  versionId = version.id;
  const effectiveFrom = new Date();
  effectiveFrom.setUTCMonth(effectiveFrom.getUTCMonth() + 1, 1);
  const start = effectiveFrom.toISOString().slice(0, 10);
  await checked(actor().from("contract_versions").update({ effective_from: start }).eq("id", versionId), "Set effective date");
  await checked(actor().from("contract_financial_terms").insert({ organization_id: version.organization_id,
    site_id: siteId, contract_version_id: versionId, basis: "fixed_monthly", amount: "1000.00",
    currency: "CAD", effective_from: start }), "Set fixed term");
  await checked(actor().rpc("approve_contract_version", { p_contract_version_id: versionId }), "Approve version");
  const preview = await checked(actor().rpc("preview_contract_activation", { p_contract_version_id: versionId }), "Preview version");
  const results = await Promise.all([actor().rpc("activate_contract_version",
    { p_contract_version_id: versionId, p_preview_token: preview.token }),
  actor().rpc("activate_contract_version",
    { p_contract_version_id: versionId, p_preview_token: preview.token })]);
  if (results.filter((result) => !result.error).length !== 1 ||
    results.filter((result) => result.error).length !== 1) {
    throw new Error("Concurrent requests did not produce one activation and one rejection.");
  }
  const revenue = await checked(admin.from("contract_revenue_expectations").select("id")
    .eq("contract_version_id", versionId), "Read expected revenue");
  if (revenue.length !== 12) throw new Error("Concurrent activation duplicated or missed revenue periods.");
  console.log("Concurrent activation passed: one commit, one rejection, twelve expected periods.");
} finally {
  if (versionId) {
    for (const table of ["contract_events", "contract_revenue_expectations", "sla_definitions",
      "shift_coverage_requirements", "shifts", "task_schedules", "service_tasks", "contract_sla_terms",
      "contract_staffing_requirements", "contract_obligations", "contract_financial_terms",
      "contract_versions"]) {
      await checked(admin.from(table).delete()
        .eq(table === "contract_versions" ? "id" : "contract_version_id", versionId), `Clean ${table}`);
    }
  }
  if (contractId) await checked(admin.from("contracts").delete().eq("id", contractId), "Clean contract");
}
