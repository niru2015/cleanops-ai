import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildScenarioPlan } from "../src/demo/scenario-plan.mjs";

const scenarioName = "stage-a-smoke";
const run = (...args) => execFileSync("node", ["scripts/demo-scenario.mjs", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const url = status.API_URL ?? status.api_url;
const key = status.SERVICE_ROLE_KEY ?? status.service_role_key;
if (typeof url !== "string" || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url) || typeof key !== "string") throw new Error("Local Supabase is required.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const source = JSON.parse(await readFile(`fixtures/scenarios/${scenarioName}/scenario.json`, "utf8"));
const reference = JSON.parse(await readFile("fixtures/reference/fictional-v1.json", "utf8"));
const plan = buildScenarioPlan(source, reference);
const registryPath = `fixtures/generated/${scenarioName}/registry.json`;
const seededOrganizations = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];

async function count(table, organizationId) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (error) throw error;
  return count;
}
function assert(value, message) { if (!value) throw new Error(message); }

let created = false;
try {
  const before = await Promise.all(seededOrganizations.map((id) => count("sites", id)));
  run("generate", scenarioName);
  created = true;
  run("assert", scenarioName);
  assert(await count("sites", plan.organization.id) === 2, "Generated site count did not query back correctly.");
  assert(await count("workers", plan.organization.id) === 4, "Generated worker count did not query back correctly.");
  const expected = JSON.parse(await readFile(`fixtures/generated/${scenarioName}/expected.json`, "utf8"));
  assert(JSON.stringify(expected) === JSON.stringify(plan.expected), "Expected manifest differs from deterministic plan.");

  // Simulate a crash after some rows have been removed: assert must fail and reset must recover.
  const deleted = await client.from("workers").delete().eq("id", plan.workers[0].id).eq("organization_id", plan.organization.id);
  if (deleted.error) throw deleted.error;
  let assertionFailed = false;
  try { run("assert", scenarioName); } catch { assertionFailed = true; }
  assert(assertionFailed, "Scenario assertion did not catch a missing worker.");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  registry.status = "partial";
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  run("reset", scenarioName);
  created = false;
  run("generate", scenarioName);
  created = true;
  run("assert", scenarioName);
  run("reset", scenarioName);
  created = false;
  const remaining = await client.from("organizations").select("id").eq("id", plan.organization.id);
  if (remaining.error) throw remaining.error;
  assert(remaining.data.length === 0, "Scenario organization remained after reset.");
  const after = await Promise.all(seededOrganizations.map((id) => count("sites", id)));
  assert(JSON.stringify(before) === JSON.stringify(after), "Reset changed a seeded tenant.");
  console.log("Scenario CLI integration passed: generate, query, manifest, partial recovery, regenerate and tenant isolation.");
} finally {
  if (created) {
    try { run("reset", scenarioName); } catch { console.error(`Manual cleanup may be needed: npm run demo:reset -- ${scenarioName}`); }
  }
}
