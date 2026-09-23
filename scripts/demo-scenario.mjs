import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFile, mkdir, writeFile, rename, access, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildScenarioPlan } from "../src/demo/scenario-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const outputRoot = join(root, "fixtures", "generated");
const safeName = /^[a-z][a-z0-9-]{2,63}$/;
let localDatabaseUrl;
let localAuth;

function parseArgs() {
  const [operation, name, ...flags] = process.argv.slice(2);
  if (!["generate", "reset", "assert", "presenter"].includes(operation) || !safeName.test(name ?? "")) {
    throw new Error("Usage: demo-scenario.mjs <generate|reset|assert|presenter> <scenario-name> [--seed <integer>]");
  }
  let seed;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === "--seed" && /^\d+$/.test(flags[i + 1] ?? "")) seed = Number(flags[++i]);
    else throw new Error(`Unsupported option: ${flags[i]}`);
  }
  if (seed !== undefined && operation !== "generate") throw new Error("--seed is available only for generate.");
  return { operation, name, seed };
}

async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function atomicJson(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}
async function loadPlan(name, seed) {
  const scenario = await json(join(root, "fixtures", "scenarios", name, "scenario.json"));
  if (scenario.scenarioId !== name) throw new Error("Scenario directory and scenarioId must match.");
  if (seed !== undefined) scenario.seed = seed;
  const pack = await json(join(root, "fixtures", "reference", `${scenario.referencePack}.json`));
  return buildScenarioPlan(scenario, pack);
}
function connectLocal() {
  const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const url = status.API_URL ?? status.api_url;
  const key = status.SERVICE_ROLE_KEY ?? status.service_role_key;
  const dbUrl = status.DB_URL ?? status.db_url;
  const anonKey = status.ANON_KEY ?? status.anon_key;
  const jwtSecret = status.JWT_SECRET ?? status.jwt_secret;
  if (typeof url !== "string" || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url) || typeof key !== "string" || typeof dbUrl !== "string" || !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname)) {
    throw new Error("A running local Supabase instance is required. This Stage A CLI never targets a hosted project.");
  }
  localDatabaseUrl = dbUrl;
  if (typeof anonKey !== "string" || typeof jwtSecret !== "string") throw new Error("Local Auth signing information is unavailable.");
  localAuth = { url, anonKey, jwtSecret };
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function directorClient(userId) {
  if (!localAuth || !/^[0-9a-f-]{36}$/.test(userId)) throw new Error("Local Director persona is unavailable.");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({ sub: userId, role: "authenticated", aud: "authenticated", iss: "supabase", iat: now, exp: now + 600 });
  const body = `${header}.${payload}`;
  const signature = createHmac("sha256", localAuth.jwtSecret).update(body).digest("base64url");
  return createClient(localAuth.url, localAuth.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${body}.${signature}` } },
  });
}
async function checked(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
function ids(rows) { return rows.map((row) => row.id); }
async function rowsFor(client, table, organizationId) {
  return checked(client.from(table).select("id").eq("organization_id", organizationId), `Read ${table}`);
}
function assertIdSet(actual, planned, table, allowPartial = false) {
  const allowed = new Set(planned);
  const actualIds = actual.map((row) => row.id);
  if (actualIds.some((id) => !allowed.has(id)) || (!allowPartial && actualIds.length !== planned.length)) {
    throw new Error(`${table} differs from the scenario registry; refusing to touch other data.`);
  }
}
async function assertScope(client, plan, allowPartial = false) {
  const org = await checked(client.from("organizations").select("id,slug").eq("id", plan.organization.id).maybeSingle(), "Read scenario organization");
  if (org && org.slug !== plan.organization.slug) throw new Error("Scenario organization ID belongs to a different slug.");
  if (!allowPartial && !org) throw new Error("Scenario organization is missing.");
  const tables = [
    ["clients", [plan.client.id]], ["sites", ids(plan.sites)], ["workers", ids(plan.workers)],
    ["worker_site_permissions", ids(plan.workerPermissions)],
    ["memberships", plan.personas.map((persona) => persona.membershipId)],
    ["member_site_access", ids(plan.memberGrants)],
  ];
  for (const [table, planned] of tables) assertIdSet(await rowsFor(client, table, plan.organization.id), planned, table, allowPartial);
  if (plan.contract) await assertContractScope(client, plan, allowPartial);
  return org;
}
const contractTables = ["contract_events", "contract_financial_terms", "contract_obligations",
  "contract_revenue_expectations", "contract_sla_terms", "contract_staffing_requirements",
  "contract_versions", "contracts", "service_tasks", "task_schedules", "shifts",
  "shift_coverage_requirements", "sla_definitions", "site_zones"];
function sqlId(input) {
  const hex = createHash("md5").update(input).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}
function contractGeneratedIds(contract) {
  const rows = {
    contract_events: [
      ...contract.versions.flatMap((version) => [sqlId(`contract-event:${version.id}:approved`),
        sqlId(`contract-event:${version.id}:activated`)]),
      sqlId(`contract-event:${contract.versions[0].id}:superseded-by:${contract.versions[1].id}`),
    ],
    service_tasks: contract.obligations.map((item) => sqlId(`contract-task:${item.id}`)),
    task_schedules: contract.obligations.map((item) => sqlId(`contract-schedule:${item.id}`)),
    shifts: [], shift_coverage_requirements: [], contract_revenue_expectations: [],
    sla_definitions: [],
  };
  for (const requirement of contract.staffing) {
    const version = contract.versions.find((item) => item.id === requirement.contract_version_id);
    const start = new Date(`${version.effective_from}T00:00:00Z`);
    for (let day = 0; day < 28; day += 1) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + day);
      if (date.getUTCDay() !== requirement.weekday) continue;
      const workDate = date.toISOString().slice(0, 10);
      rows.shifts.push(sqlId(`contract-shift:${requirement.id}:${workDate}`));
      rows.shift_coverage_requirements.push(sqlId(`contract-coverage:${requirement.id}:${workDate}`));
    }
  }
  for (const term of contract.terms) {
    const start = new Date(`${term.effective_from}T00:00:00Z`);
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(start);
      date.setUTCMonth(date.getUTCMonth() + month);
      rows.contract_revenue_expectations.push(sqlId(`contract-revenue:${term.id}:${date.toISOString().slice(0, 10)}`));
    }
  }
  return rows;
}
async function assertContractScope(client, plan, allowPartial) {
  const contract = plan.contract;
  for (const [table, planned] of [
    ["site_zones", [contract.zone.id]], ["contracts", [contract.identity.id]],
    ["contract_versions", ids(contract.versions)], ["contract_financial_terms", ids(contract.terms)],
    ["contract_obligations", ids(contract.obligations)],
    ["contract_staffing_requirements", ids(contract.staffing)], ["contract_sla_terms", []],
  ]) assertIdSet(await rowsFor(client, table, plan.organization.id), planned, table, allowPartial);
  const versionIds = new Set(ids(contract.versions));
  for (const [table, planned] of Object.entries(contractGeneratedIds(contract))) {
    const entries = await checked(client.from(table).select("id,contract_version_id")
      .eq("organization_id", plan.organization.id), `Read ${table}`);
    if (entries.some((entry) => !versionIds.has(entry.contract_version_id)) ||
      entries.some((entry) => !planned.includes(entry.id)) ||
      (!allowPartial && entries.length !== planned.length)) {
      throw new Error(`${table} differs from the contract scenario scope; refusing reset.`);
    }
  }
  if (!allowPartial) {
    const entries = await checked(client.from("contract_revenue_expectations")
      .select("amount,is_current").eq("organization_id", plan.organization.id), "Read expected revenue");
    const current = entries.filter((entry) => entry.is_current);
    const cents = current.reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100), 0);
    if (current.length !== contract.expected.currentRevenueEntries ||
      (cents / 100).toFixed(2) !== contract.expected.expectedRevenue) {
      throw new Error("Contract expected revenue does not reconcile to the scenario manifest.");
    }
  }
}
async function countAttached(organizationId, hasContracts) {
  if (!/^[0-9a-f-]{36}$/.test(organizationId) || !localDatabaseUrl) throw new Error("Invalid local reset scope.");
  const baseTables = new Set(["clients", "sites", "workers", "worker_site_permissions", "memberships", "member_site_access"]);
  if (hasContracts) for (const table of contractTables) baseTables.add(table);
  const names = execFileSync("psql", [localDatabaseUrl, "-At", "-c", "select table_name from information_schema.columns where table_schema='public' and column_name='organization_id' order by table_name"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const tables = names.trim().split("\n").filter((table) => table && !baseTables.has(table));
  if (tables.some((table) => !/^[a-z][a-z0-9_]*$/.test(table))) throw new Error("Unexpected table name in local schema.");
  if (!tables.length) throw new Error("No organization-scoped tables found in local schema.");
  const query = tables.map((table) => `select '${table}',count(*) from public.${table} where organization_id='${organizationId}'`).join(" union all ");
  const result = execFileSync("psql", [localDatabaseUrl, "-At", "-c", query], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  for (const line of result.trim().split("\n")) {
    const [table, count] = line.split("|");
    if (Number(count) > 0) throw new Error(`Scenario organization has ${table} records outside the Stage A registry; refusing reset.`);
  }
}
async function listScenarioUsers(client, plan) {
  const emails = new Set(plan.personas.map((persona) => persona.email));
  const found = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await checked(client.auth.admin.listUsers({ page, perPage: 100 }), "List demo users");
    for (const user of data.users) if (emails.has(user.email) && user.user_metadata?.demo_scenario_id === plan.scenario.scenarioId) found.push(user);
    if (data.users.length < 100) break;
  }
  return found;
}
async function generateContracts(client, plan, registry) {
  if (!plan.contract) return;
  const director = plan.personas.find((persona) => persona.role === "organization_administrator");
  const directorIndex = plan.personas.indexOf(director);
  const directorId = registry.authUserIds[directorIndex];
  if (!directorId) throw new Error("Contract builder requires its generated Director persona.");
  const actor = directorClient(directorId);
  const contract = plan.contract;
  await checked(client.from("site_zones").insert(contract.zone), "Create contract zone");
  await checked(client.from("contracts").insert({ ...contract.identity, created_by: directorId }), "Create manual contract source");
  for (let index = 0; index < contract.versions.length; index += 1) {
    const version = contract.versions[index];
    await checked(client.from("contract_versions").insert({ ...version, created_by: directorId }), `Create contract version ${index + 1}`);
    await checked(client.from("contract_financial_terms").insert(contract.terms[index]), `Create commercial term ${index + 1}`);
    await checked(client.from("contract_obligations").insert(contract.obligations[index]), `Create service obligation ${index + 1}`);
    await checked(client.from("contract_staffing_requirements").insert(contract.staffing[index]), `Create staffing rule ${index + 1}`);
    await checked(actor.rpc("approve_contract_version", { p_contract_version_id: version.id }), `Director approval ${index + 1}`);
    const preview = await checked(actor.rpc("preview_contract_activation", { p_contract_version_id: version.id }), `Contract preview ${index + 1}`);
    if (typeof preview?.token !== "string") throw new Error("Contract preview omitted its token.");
    await checked(actor.rpc("activate_contract_version", { p_contract_version_id: version.id, p_preview_token: preview.token }), `Director activation ${index + 1}`);
  }
}
async function generate(name, seed) {
  const plan = await loadPlan(name, seed); // Validate before any writes.
  const directory = join(outputRoot, name);
  const registryPath = join(directory, "registry.json");
  if (await exists(registryPath)) throw new Error(`Scenario ${name} already has a registry. Run demo:assert or demo:reset first.`);
  const client = connectLocal();
  const existing = await checked(client.from("organizations").select("id").eq("id", plan.organization.id).maybeSingle(), "Check scenario ID");
  if (existing) throw new Error("Scenario organization ID already exists without a registry; refusing to adopt it.");
  await mkdir(directory, { recursive: true });
  const registry = { scenarioId: name, runId: plan.runId, seed: plan.scenario.seed, generatorVersion: plan.scenario.generatorVersion, organizationId: plan.organization.id, status: "generating", createdAt: new Date().toISOString(), authUserIds: [] };
  await atomicJson(registryPath, registry);
  await atomicJson(join(directory, "expected.json"), plan.expected);
  try {
    await checked(client.from("organizations").insert(plan.organization), "Create scenario organization");
    await checked(client.from("clients").insert(plan.client), "Create scenario client");
    await checked(client.from("sites").insert(plan.sites), "Create scenario sites");
    await checked(client.from("workers").insert(plan.workers.map((worker) => ({ id: worker.id, organization_id: worker.organization_id, display_name: worker.display_name, active: worker.active }))), "Create scenario workers");
    await checked(client.from("worker_site_permissions").insert(plan.workerPermissions), "Grant worker sites");
    for (const persona of plan.personas) {
      const result = await checked(client.auth.admin.createUser({
        email: persona.email, email_confirm: true,
        user_metadata: { cleanops_demo: true, demo_scenario_id: name, display_name: persona.displayName, persona: persona.role },
      }), `Create persona ${persona.key}`);
      const userId = result.user?.id;
      if (!userId) throw new Error(`Create persona ${persona.key}: no user ID returned.`);
      registry.authUserIds.push(userId);
      await atomicJson(registryPath, registry);
      await checked(client.from("memberships").insert({ id: persona.membershipId, organization_id: plan.organization.id, user_id: userId, role: persona.role }), `Create membership ${persona.key}`);
      if (persona.workerId) await checked(client.from("workers").update({ auth_user_id: userId }).eq("id", persona.workerId).eq("organization_id", plan.organization.id), `Link worker ${persona.key}`);
    }
    if (plan.memberGrants.length) await checked(client.from("member_site_access").insert(plan.memberGrants), "Grant persona sites");
    await generateContracts(client, plan, registry);
    await assertScope(client, plan);
    registry.status = "ready";
    await atomicJson(registryPath, registry);
    console.log(`Generated ${name} (seed ${plan.scenario.seed}): ${plan.sites.length} sites, ${plan.workers.length} workers, ${plan.personas.length} personas${plan.contract ? ", one approved contract and future amendment" : ""}.`);
  } catch (error) {
    registry.status = "partial";
    await atomicJson(registryPath, registry);
    throw error;
  }
}
async function loadRegistry(name) {
  const directory = join(outputRoot, name);
  const path = join(directory, "registry.json");
  if (!(await exists(path))) throw new Error(`No generated registry for ${name}.`);
  const registry = await json(path);
  if (registry.scenarioId !== name) throw new Error("Registry scenario ID mismatch.");
  const plan = await loadPlan(name, registry.seed);
  if (plan.organization.id !== registry.organizationId || plan.runId !== registry.runId) throw new Error("Registry identity mismatch.");
  return { directory, registry, plan };
}
async function assertScenario(name) {
  const { registry, plan } = await loadRegistry(name);
  if (registry.status !== "ready") throw new Error(`Scenario ${name} is ${registry.status}; reset and regenerate.`);
  const client = connectLocal();
  await assertScope(client, plan);
  const users = await listScenarioUsers(client, plan);
  if (users.length !== plan.personas.length) throw new Error("Scenario Auth persona count differs from expected.");
  console.log(`Scenario ${name} matches its manifest: ${plan.sites.length} sites, ${plan.workers.length} workers, ${plan.personas.length} personas${plan.contract ? `, ${plan.contract.expected.expectedRevenue} CAD current expected revenue` : ""}.`);
}
async function reset(name) {
  const { directory, registry, plan } = await loadRegistry(name);
  const client = connectLocal();
  const org = await assertScope(client, plan, true);
  if (org) await countAttached(plan.organization.id, Boolean(plan.contract));
  registry.status = "resetting";
  await atomicJson(join(directory, "registry.json"), registry);
  if (plan.contract) {
    for (const table of ["contract_events", "contract_revenue_expectations", "sla_definitions",
      "shift_coverage_requirements", "shifts", "task_schedules", "service_tasks",
      "contract_sla_terms", "contract_staffing_requirements", "contract_obligations",
      "contract_financial_terms", "contract_versions", "contracts", "site_zones"]) {
      await checked(client.from(table).delete().eq("organization_id", plan.organization.id), `Delete ${table}`);
    }
  }
  for (const [table, planned] of [
    ["member_site_access", ids(plan.memberGrants)], ["memberships", plan.personas.map((persona) => persona.membershipId)],
    ["worker_site_permissions", ids(plan.workerPermissions)], ["workers", ids(plan.workers)],
    ["sites", ids(plan.sites)], ["clients", [plan.client.id]],
  ]) {
    if (planned.length) await checked(client.from(table).delete().eq("organization_id", plan.organization.id).in("id", planned), `Delete ${table}`);
  }
  if (org) await checked(client.from("organizations").delete().eq("id", plan.organization.id).eq("slug", plan.organization.slug), "Delete scenario organization");
  for (const user of await listScenarioUsers(client, plan)) await checked(client.auth.admin.deleteUser(user.id), `Delete persona ${user.email}`);
  await rm(directory, { recursive: true, force: true });
  console.log(`Reset ${name}; only registry-listed base records and tagged scenario Auth users were removed.`);
}
async function presenter(name) {
  const { registry, plan } = await loadRegistry(name);
  if (registry.status !== "ready") throw new Error(`Scenario ${name} is not ready.`);
  const lines = [
    `# ${name} presenter guide (Stage A base only)`, "",
    "All names and records are synthetic demo references; no customer relationship or measured performance is implied.", "",
    `Seed: ${plan.scenario.seed}. Sites: ${plan.sites.map((site) => site.name).join(", ")}.`,
    "Run npm run demo:assert -- " + name + " before presenting.",
    "Persona Auth records have no password until a protected provisioning step sets one.",
    plan.contract
      ? `Contract ${plan.contract.identity.code}: fixed monthly source ${plan.contract.terms[0].amount} CAD, future amendment ${plan.contract.terms[1].amount} CAD from ${plan.contract.expected.amendmentDate}. Expected current revenue ${plan.contract.expected.expectedRevenue} CAD; inspect /finance/contracts. Expenses, time, projects and reconciliation remain pending.`
      : "Finance, contracts, expenses, time, projects and reconciliation journeys are not generated by Stage A.",
  ];
  const output = `${lines.join("\n")}\n`;
  await writeFile(join(outputRoot, name, "presenter-tests.md"), output);
  process.stdout.write(output);
}

try {
  const { operation, name, seed } = parseArgs();
  if (operation === "generate") await generate(name, seed);
  if (operation === "reset") await reset(name);
  if (operation === "assert") await assertScenario(name);
  if (operation === "presenter") await presenter(name);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Scenario command failed.");
  process.exitCode = 1;
}
