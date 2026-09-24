import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFile, mkdir, writeFile, rename, access, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { buildScenarioPlan } from "../src/demo/scenario-plan.mjs";
import { contractSourceLines, hashFixture, scannedContractPng,
  simpleContractPdf } from "../src/demo/contract-document-fixtures.mjs";
import { expenseMessage, receiptSha, syntheticReceipt } from "../src/demo/expense-fixtures.mjs";

const root = resolve(import.meta.dirname, "..");
let outputRoot = join(root, "fixtures", "generated");
const safeName = /^[a-z][a-z0-9-]{2,63}$/;
let localDatabaseUrl;
let localAuth;
let hostedClient;
let hostedTarget;

function parseArgs() {
  const [operation, name, ...flags] = process.argv.slice(2);
  if (!["generate", "reset", "assert", "presenter", "preflight", "plan"].includes(operation) || !safeName.test(name ?? "")) {
    throw new Error("Usage: demo-scenario.mjs <generate|reset|assert|presenter|preflight|plan> <scenario-name> [--seed <integer>] [--target hosted --project-ref <ref> --organization-id <uuid> --apply]");
  }
  let seed, target = "local", projectRef, organizationId, apply = false;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === "--seed" && /^\d+$/.test(flags[i + 1] ?? "")) seed = Number(flags[++i]);
    else if (flags[i] === "--target" && flags[i + 1] === "hosted") { target = "hosted"; i++; }
    else if (flags[i] === "--project-ref" && /^[a-z0-9]{20}$/.test(flags[i + 1] ?? "")) projectRef = flags[++i];
    else if (flags[i] === "--organization-id" && /^[0-9a-f-]{36}$/.test(flags[i + 1] ?? "")) organizationId = flags[++i];
    else if (flags[i] === "--apply") apply = true;
    else throw new Error(`Unsupported option: ${flags[i]}`);
  }
  if (seed !== undefined && !["generate", "plan", "preflight"].includes(operation)) throw new Error("--seed is available only for generate, plan, or preflight.");
  if (target === "hosted" && (!projectRef || !organizationId)) throw new Error("Hosted target requires explicit --project-ref and --organization-id.");
  if (target === "local" && (projectRef || organizationId || apply)) throw new Error("Hosted flags require --target hosted.");
  if (target === "hosted" && ["generate", "reset"].includes(operation) && !apply) throw new Error("Hosted writes require --apply after a reviewed preflight.");
  if (target === "hosted" && ["presenter", "plan"].includes(operation)) throw new Error("Generate plan or presenter notes locally before targeting a hosted project.");
  return { operation, name, seed, target, projectRef, organizationId };
}

async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function atomicJson(path, value) {
  if (hostedClient && path.endsWith("/registry.json")) {
    const record = {
      run_id: value.runId, scenario_id: value.scenarioId, organization_id: value.organizationId,
      project_ref: hostedTarget.projectRef, status: value.status, registry: value,
    };
    if (!hostedTarget.registryPersisted) {
      await checked(hostedClient.from("demo_scenario_runs").insert(record), "Create hosted scenario registry");
      hostedTarget.registryPersisted = true;
    } else {
      const changed = await checked(hostedClient.from("demo_scenario_runs").update({ status: value.status, registry: value })
        .eq("run_id", value.runId).eq("organization_id", value.organizationId)
        .eq("project_ref", hostedTarget.projectRef).select("run_id"), "Update hosted scenario registry");
      if (changed.length !== 1) throw new Error("Hosted registry no longer belongs to this project and organization.");
    }
  }
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
function connectHosted() {
  const { projectRef, organizationId } = hostedTarget ?? {};
  const url = process.env.CLEANOPS_HOSTED_DEMO_URL;
  const secret = process.env.CLEANOPS_HOSTED_DEMO_SECRET_KEY;
  const anonKey = process.env.CLEANOPS_HOSTED_DEMO_PUBLISHABLE_KEY;
  const password = process.env.CLEANOPS_HOSTED_DEMO_PASSWORD;
  if (url !== `https://${projectRef}.supabase.co` || !secret || !anonKey || !password || password.length < 12)
    throw new Error("Hosted endpoint, secret, publishable key and 12+ character persona password are required for the explicit project ref.");
  if (!/^[0-9a-f-]{36}$/.test(organizationId)) throw new Error("Invalid hosted scenario organization ID.");
  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  hostedClient = client;
  localAuth = { url, anonKey, password };
  if (process.env.CLEANOPS_HOSTED_DEMO_DATABASE_URL) {
    const dbUrl = new URL(process.env.CLEANOPS_HOSTED_DEMO_DATABASE_URL);
    if (dbUrl.protocol !== "postgresql:" ||
      (!dbUrl.hostname.includes(projectRef) && !decodeURIComponent(dbUrl.username).includes(projectRef)) ||
      ["localhost", "127.0.0.1"].includes(dbUrl.hostname))
      throw new Error("Hosted database URL does not identify the explicit project ref.");
    localDatabaseUrl = dbUrl.toString();
  }
  return client;
}
function connectTarget() { return hostedTarget ? connectHosted() : connectLocal(); }
async function personaClient(userId) {
  if (!localAuth || !/^[0-9a-f-]{36}$/.test(userId)) throw new Error("Local Director persona is unavailable.");
  if (hostedTarget) {
    const persona = hostedTarget.plan.personas.find((_, index) => hostedTarget.registry?.authUserIds[index] === userId);
    if (!persona) throw new Error("Hosted persona is outside this scenario registry.");
    const actor = createClient(localAuth.url, localAuth.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await actor.auth.signInWithPassword({ email: persona.email, password: localAuth.password });
    if (signed.error || signed.data.user?.id !== userId) throw new Error(`Hosted persona ${persona.key} could not authenticate.`);
    return actor;
  }
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
async function assertScope(client, plan, allowPartial = false, registry = null) {
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
  if (plan.contract) await assertContractScope(client, plan, allowPartial, registry);
  if (plan.expenseCases) await assertExpenseScope(client,plan,registry,allowPartial);
  if (plan.timeCases) await assertTimeScope(client,plan,registry,allowPartial);
  if (plan.projects) await assertProjectScope(client,plan,registry,allowPartial);
  if (plan.scenario.modules.reconciliation) await assertReconciliationScope(client,plan,registry,allowPartial);
  return org;
}
const contractTables = ["contract_events", "contract_financial_terms", "contract_obligations",
  "contract_revenue_expectations", "contract_sla_terms", "contract_staffing_requirements", "contract_documents",
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
async function assertContractScope(client, plan, allowPartial, registry) {
  const contract = plan.contract;
  for (const [table, planned] of [
    ["site_zones", [contract.zone.id]], ["contracts", [contract.identity.id]],
    ["contract_versions", ids(contract.versions)], ["contract_financial_terms", ids(contract.terms)],
    ["contract_obligations", ids(contract.obligations)],
    ["contract_staffing_requirements", ids(contract.staffing)], ["contract_sla_terms", []],
  ]) assertIdSet(await rowsFor(client, table, plan.organization.id), planned, table, allowPartial);
  if (plan.scenario.generatorVersion >= 7)
    assertIdSet(await rowsFor(client, "contract_documents", plan.organization.id),
      (registry?.contractDocuments ?? []).map(item => item.id), "contract_documents", allowPartial);
  const versionIds = new Set(ids(contract.versions));
  for (const [table, planned] of Object.entries(contractGeneratedIds(contract))) {
    let query=client.from(table).select("id,contract_version_id").eq("organization_id", plan.organization.id);
    if(table==="shifts")query=query.in("contract_version_id",ids(contract.versions));
    const entries = await checked(query, `Read ${table}`);
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
async function assertExpenseScope(client,plan,registry,allowPartial){
  if(!registry?.expenses) {
    if(allowPartial)return;
    throw new Error("Expense scenario registry missing.");
  }
  const rows=registry.expenses.rows;
  const checks=[
    ["integration_accounts",[registry.expenses.accountId]],
    ["integration_webhook_events",rows.map(row=>row.eventId).filter(Boolean)],
    ["processing_jobs",rows.map(row=>row.jobId).filter(Boolean)],
    ["finance_intake_items",rows.map(row=>row.intakeId)],
    ["expense_claims",rows.map(row=>row.claimId)],
    ["expense_documents",rows.map(row=>row.documentId)],
    ["expense_postings",rows.flatMap(row=>row.postingIds)],
    ["external_messages",rows.map(row=>row.messageId).filter(Boolean)],
    ["task_evidence",rows.map(row=>row.evidenceId).filter(Boolean)],
  ];
  for(const [table,planned] of checks){
    const actual=await rowsFor(client,table,plan.organization.id);
    assertIdSet(actual,planned,table,allowPartial);
  }
  const linked=[
    ["expense_items","claim_id",rows.map(row=>row.claimId)],
    ["expense_allocations","claim_id",rows.map(row=>row.claimId)],
    ["expense_audit_events","intake_id",rows.map(row=>row.intakeId)],
    ["external_message_contexts","external_message_id",rows.map(row=>row.messageId).filter(Boolean)],
    ["external_message_media","external_message_id",rows.map(row=>row.messageId).filter(Boolean)],
  ];
  for(const [table,key,parents] of linked){
    const actual=await checked(client.from(table).select(key)
      .eq("organization_id",plan.organization.id),`Read ${table} scope`);
    if(actual.some(row=>!parents.includes(row[key])))
      throw new Error(`${table} has records outside the scenario source scope; refusing reset.`);
  }
  if(!allowPartial){
    if(rows.length!==plan.expenseCases.length)throw new Error("Expense case count differs from manifest.");
    const postings=await checked(client.from("expense_postings").select("amount,category")
      .eq("organization_id",plan.organization.id),"Read expense totals");
    const cents=postings.reduce((sum,row)=>sum+Math.round(Number(row.amount)*100),0);
    if((cents/100).toFixed(2)!==plan.expected.controlTotals.finance.approvedExpenseCost)
      throw new Error("Approved expense cost differs from the scenario manifest.");
  }
}
async function assertTimeScope(client,plan,registry,allowPartial){
  if(!registry?.time){if(allowPartial)return;throw new Error("Time scenario registry missing.");}
  const time=registry.time;
  const checks=[
    ["shifts",time.rows.filter(row=>row.createdShiftId).map(row=>row.createdShiftId)],
    ["shift_assignments",time.rows.filter(row=>row.assignmentId).map(row=>row.assignmentId)],
    ["attendance_events",time.rows.flatMap(row=>row.attendanceIds??[])],
    ["time_entries",time.rows.map(row=>row.timeEntryId)],
    ["worker_cost_rates",time.rateIds],
    ["labor_cost_entries",time.rows.map(row=>row.ledgerId).filter(Boolean)],
  ];
  for(const [table,planned] of checks){
    const actual=await rowsFor(client,table,plan.organization.id);
    if(table==="shifts"){
      const contractIds=new Set(plan.contract?contractGeneratedIds(plan.contract).shifts:[]);
      assertIdSet(actual.filter(row=>!contractIds.has(row.id)),planned,table,allowPartial);
    }else assertIdSet(actual,planned,table,allowPartial);
  }
  const rateEvents=await checked(client.from("worker_cost_rate_events").select("rate_id")
    .eq("organization_id",plan.organization.id),"Read rate audit scope");
  const timeEvents=await checked(client.from("time_entry_events").select("time_entry_id")
    .eq("organization_id",plan.organization.id),"Read time audit scope");
  if(rateEvents.some(row=>!time.rateIds.includes(row.rate_id)) ||
    timeEvents.some(row=>!time.rows.some(item=>item.timeEntryId===row.time_entry_id)))
    throw new Error("Time or rate audit outside scenario registry; refusing reset.");
  if(!allowPartial){
    if(time.rows.length!==plan.timeCases.length)throw new Error("Time case count differs from manifest.");
    const entries=await checked(client.from("time_entries").select("id,state,exception_code,source_type,project_reference,contract_version_id")
      .eq("organization_id",plan.organization.id),"Read time cases");
    for(const item of plan.timeCases){
      const row=time.rows.find(record=>record.key===item.key);
      const actual=entries.find(record=>record.id===row?.timeEntryId);
      if(!actual||actual.state!==item.status || (item.status==="exception"&&
        actual.exception_code!==(item.key==="worker_swap_original"?"worker_swap":"missing_checkout")))
        throw new Error(`Time case ${item.key} differs from its expected state.`);
    }
    const recurring=entries.find(entry=>entry.id===time.rows.find(row=>row.key==="normal_shift")?.timeEntryId);
    if(plan.contract && recurring?.contract_version_id!==plan.contract.versions[0].id)
      throw new Error("Normal shift time lost activated contract provenance.");
    const ledger=await checked(client.from("labor_cost_entries").select("total_cost")
      .eq("organization_id",plan.organization.id),"Read approved labour cost");
    const cents=ledger.reduce((sum,row)=>sum+Math.round(Number(row.total_cost)*100),0);
    if((cents/100).toFixed(2)!==plan.expected.controlTotals.finance.approvedLabourCost)
      throw new Error("Approved labour cost differs from the source-backed scenario manifest.");
  }
}
async function assertProjectScope(client,plan,registry,allowPartial){
  const projectIds=plan.projects.map(item=>item.id);
  for(const table of ["projects","project_revenue_terms","project_invoices","project_source_links"]){
    const actual=await rowsFor(client,table,plan.organization.id);
    const planned=table==="projects"?projectIds:table==="project_revenue_terms"?registry.projects?.termIds??[]:
      table==="project_invoices"?registry.projects?.invoiceIds??[]:registry.projects?.linkIds??[];
    assertIdSet(actual,planned,table,allowPartial);
  }
  for(const table of ["finance_import_batches","finance_source_rows","finance_source_allocations"]){
    const actual=await rowsFor(client,table,plan.organization.id);
    const planned=[...(registry.projects?.accounting?.[table]??[]),...(registry.reconciliation?.accounting?.[table]??[])];
    assertIdSet(actual,planned,table,allowPartial);
  }
  if(allowPartial)return;
  const director=plan.personas.find(persona=>persona.role==="organization_administrator");
  const actor=await personaClient(registry.authUserIds[plan.personas.indexOf(director)]);
  const summaries=await checked(actor.rpc("list_finance_projects",{p_site_id:plan.sites[0].id}),"Read project contribution");
  for(const expected of plan.expected.projects){
    const actual=summaries.find(item=>item.project_code===expected.code);
    if(!actual||Number(actual.expected_revenue).toFixed(2)!==expected.quote||
      Number(actual.recognized_revenue).toFixed(2)!==expected.recognized||
      Number(actual.direct_cost).toFixed(2)!==expected.directCost||
      (actual.recognized_contribution===null?null:Number(actual.recognized_contribution).toFixed(2))!==expected.contribution||
      actual.completeness!==expected.completeness)
      throw new Error(`Project ${expected.code} does not reconcile to its source-backed manifest.`);
  }
  const sitePostings=await checked(client.from("expense_postings").select("id,amount,project_id")
    .eq("organization_id",plan.organization.id).eq("site_id",plan.sites[0].id),"Read site expense source total");
  const plannedSiteCents=plan.expenseCases.filter(item=>item.approved&&item.siteIndex===0)
    .reduce((sum,item)=>sum+item.cents,0);
  const actualSiteCents=sitePostings.reduce((sum,item)=>sum+Math.round(Number(item.amount)*100),0);
  if(actualSiteCents!==plannedSiteCents)throw new Error("Project expense was added again to the site cost.");
  const allocation=await checked(client.from("finance_source_allocations").select("id,amount,project_id")
    .eq("organization_id",plan.organization.id).eq("site_id",plan.sites[0].id)
    .eq("source_row_id",registry.projects.accounting.finance_source_rows[0]),"Read project accounting allocation");
  if(allocation.length!==1||allocation[0].project_id!==plan.projects[0].id||
    Math.round(Number(allocation[0].amount)*100)!==plan.projects[0].recognized)
    throw new Error("Project accounting revenue does not equal its single site allocation.");
}
async function countAttached(organizationId, hasContracts, hasExpenses, hasTime, hasProjects) {
  if (!/^[0-9a-f-]{36}$/.test(organizationId) || !localDatabaseUrl) throw new Error("Database URL and exact scenario organization are required for reset.");
  const baseTables = new Set(["clients", "sites", "workers", "worker_site_permissions", "memberships", "member_site_access", "demo_scenario_runs"]);
  if (hasContracts) for (const table of contractTables) baseTables.add(table);
  if (hasExpenses) for(const table of ["integration_accounts","integration_webhook_events",
    "processing_jobs","external_messages","external_message_contexts","external_message_media",
    "task_evidence","finance_intake_items","expense_documents","expense_claims","expense_items",
    "expense_allocations","expense_postings","expense_audit_events"])baseTables.add(table);
  if(hasTime)for(const table of ["shifts","shift_assignments","attendance_events",
    "time_entries","time_entry_events","worker_cost_rates","worker_cost_rate_events",
    "labor_cost_entries"])baseTables.add(table);
  if(hasProjects)for(const table of ["projects","project_revenue_terms","project_invoices","project_source_links",
    "project_billable_approvals","finance_import_batches","finance_source_rows",
    "finance_source_allocations","finance_reconciliations"])baseTables.add(table);
  if(hasProjects)for(const table of ["finance_periods","finance_period_events",
    "finance_reconciliation_links","finance_reconciliation_events"])baseTables.add(table);
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
  const actor = await personaClient(directorId);
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
async function writeContractDocumentPack(directory, contract) {
  if (!contract) return;
  const source = simpleContractPdf(contractSourceLines(contract));
  const amendment = simpleContractPdf(contractSourceLines(contract, true));
  const scan = await scannedContractPng(contractSourceLines(contract).filter((line) =>
    /SYNTHETIC|Monthly fee|Staffing|Recurring task/.test(line)));
  const files = [
    ["contract-source.pdf", source], ["contract-amendment.pdf", amendment],
    ["contract-scan.png", scan],
  ];
  for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
  await atomicJson(join(directory, "contract-documents.json"), {
    schemaVersion: 1,
    files: Object.fromEntries(files.map(([name, bytes]) => [name, { sha256: hashFixture(bytes),
      bytes: bytes.length }])),
    expected: { source: { amount: contract.terms[0].amount, currency: "CAD", page: 1,
      staffingPositions: contract.staffing[0].required_positions,
      recurringTask: contract.obligations[0].name },
      amendment: { amount: contract.terms[1].amount, effectiveFrom: contract.versions[1].effective_from,
        page: 1 }, ambiguous: "Payment terms: TBD;" },
  });
}
async function generateContractDocuments(client, plan, registry, directory) {
  if (!plan.contract || plan.scenario.generatorVersion < 7) return;
  const director = plan.personas.find(persona => persona.role === "organization_administrator");
  const directorId = registry.authUserIds[plan.personas.indexOf(director)];
  registry.contractDocuments = [];
  for (const [index, file] of ["contract-source.pdf", "contract-amendment.pdf"].entries()) {
    const bytes = await readFile(join(directory, file));
    const version = plan.contract.versions[index];
    const storagePath = `${plan.organization.id}/contract-scenario/${plan.runId}/${file}`;
    const document = { id: sqlId(`contract-document:${version.id}:${file}`), file,
      storagePath, versionId: version.id };
    registry.contractDocuments.push(document);
    await atomicJson(join(directory, "registry.json"), registry);
    await checked(client.storage.from("contract-documents").upload(storagePath, bytes,
      { contentType: "application/pdf", upsert: false }), `Upload synthetic ${file}`);
    await checked(client.from("contract_documents").insert({ id: document.id,
      organization_id: plan.organization.id, site_id: plan.sites[0].id,
      contract_version_id: version.id, file_name: file, declared_mime: "application/pdf",
      detected_mime: "application/pdf", claimed_byte_size: bytes.length, byte_size: bytes.length,
      claimed_sha256: hashFixture(bytes), sha256: hashFixture(bytes), page_count: 1,
      storage_path: storagePath, uploaded_by: directorId, status: "ready",
      finalized_at: new Date().toISOString() }), `Register synthetic ${file}`);
  }
}
async function writeExpenseReceiptPack(directory,plan){
  if(!plan.expenseCases)return null;
  const files={};
  for(const item of plan.expenseCases){
    if(files[item.file])continue;
    const bytes=await syntheticReceipt(item,plan.sites[item.siteIndex].name);
    await writeFile(join(directory,item.file),bytes);
    files[item.file]={sha256:receiptSha(bytes),bytes:bytes.length};
  }
  const manifest={schemaVersion:1,cases:plan.expenseCases.map(item=>({
    key:item.key,category:item.category,site:plan.sites[item.siteIndex].name,
    date:item.date,total:(item.cents/100).toFixed(2),currency:"CAD",file:item.file,
    sourceText:expenseMessage(item,plan.sites[item.siteIndex].name),approved:item.approved,
  })),files,approvedExpenseCost:plan.expected.controlTotals.finance.approvedExpenseCost,
    duplicate:"duplicate-fuel uses fuel-receipt.png and must not create another posting"};
  await atomicJson(join(directory,"expense-receipts.json"),manifest);
  return manifest;
}
async function generateExpenses(client,plan,registry,directory){
  if(!plan.expenseCases)return;
  const director=plan.personas.find(persona=>persona.role==="organization_administrator");
  const directorId=registry.authUserIds[plan.personas.indexOf(director)];
  const directorActor=await personaClient(directorId);
  const account={id:sqlId(`expense-account:${plan.runId}`),organization_id:plan.organization.id,
    site_id:plan.sites[0].id,provider:"mock_legacy_whatsapp_group",
    external_account_id:`scenario-${plan.scenario.scenarioId}-expense`,display_name:"Synthetic Expense Inbox"};
  await checked(client.from("integration_accounts").insert(account),"Create scenario message account");
  registry.expenses={accountId:account.id,rows:[]};
  await atomicJson(join(directory,"registry.json"),registry);
  for(const item of plan.expenseCases){
    const site=plan.sites[item.siteIndex];
    const sourceText=expenseMessage(item,site.name);
    let intakeId;
    let messageId=null;
    let eventId=null;
    let jobId=null;
    let evidenceId=null;
    if(item.sourceKind==="whatsapp"){
      const payload={source:"synthetic-demo",key:item.key};
      const accepted=await checked(client.rpc("accept_mock_ingress_event",{
        p_external_account_id:account.external_account_id,p_provider_event_id:`scenario-${item.key}`,
        p_dedupe_key:`${plan.runId}-${item.key}`,p_payload:payload,
        p_payload_sha256:receiptSha(Buffer.from(JSON.stringify(payload))),
      }),`Accept ${item.key} WhatsApp event`);
      eventId=accepted[0].event_id;jobId=accepted[0].job_id;
      // The normal worker claims the oldest job across every organization. A demo replay
      // must lease only the job created by this event, without touching another tenant's queue.
      const workerId=`scenario-${plan.runId}`;
      const leasedAt=new Date();
      const claimed=await checked(client.from("processing_jobs").update({
        status:"processing",attempt_count:1,lease_owner:workerId,
        lease_expires_at:new Date(leasedAt.getTime()+120_000).toISOString(),
        updated_at:leasedAt.toISOString(),
      }).eq("id",jobId).eq("organization_id",plan.organization.id)
        .eq("integration_event_id",eventId).eq("status","pending")
        .eq("attempt_count",0).select("id"),`Lease ${item.key} scenario message job`);
      if(claimed.length!==1)throw new Error(`Scenario message job ${item.key} was already claimed or changed.`);
      await checked(client.rpc("complete_processing_job",{
        p_job_id:jobId,p_worker_id:workerId,
        p_messages:[{externalMessageId:`scenario-${plan.runId}-${item.key}`,
          externalThreadId:"expense-demo",senderId:"synthetic-worker",
          occurredAt:`${item.date}T12:00:00Z`,text:sourceText,
          mediaRefs:[{externalId:`receipt-${item.key}`,contentType:"image/png"}]}],
      }),`Normalize ${item.key} message`);
      const message=await checked(client.from("external_messages").select("id")
        .eq("integration_account_id",account.id)
        .eq("external_message_id",`scenario-${plan.runId}-${item.key}`).single(),
      `Find ${item.key} message`);
      messageId=message.id;
      const intake=await checked(client.from("finance_intake_items").select("id")
        .eq("source_message_id",messageId).single(),`Find ${item.key} candidate`);
      intakeId=intake.id;
    }else{
      const persona=plan.personas.find(p=>["cleaner","area_manager"].includes(p.role)
        &&p.siteIndex===item.siteIndex);
      if(!persona)throw new Error(`No app expense persona for ${item.key}.`);
      const userId=registry.authUserIds[plan.personas.indexOf(persona)];
      intakeId=await checked((await personaClient(userId)).rpc("submit_app_finance_intake",
        {p_site_id:site.id,p_text:sourceText}),`Submit ${item.key} app expense`);
    }
    const bytes=await readFile(join(directory,item.file));
    const sha256=receiptSha(bytes);
    const storageBucket=item.sourceKind==="whatsapp"?"operational-evidence":"expense-receipts";
    const storagePath=`${plan.organization.id}/expense-scenario/${plan.runId}/${item.key}.png`;
    await checked(client.storage.from(storageBucket).upload(storagePath,bytes,
      {contentType:"image/png",upsert:false}),`Store ${item.key} receipt`);
    let documentId;
    if(messageId){
      const evidence=await checked(client.from("task_evidence").insert({
        organization_id:plan.organization.id,integration_account_id:account.id,
        external_message_id:messageId,media_external_id:`receipt-${item.key}`,
        processing_status:"ready",linkage_status:"unresolved",storage_path:storagePath,
        content_type:"image/png",byte_size:bytes.length,sha256,received_at:`${item.date}T12:01:00Z`,
      }).select("id").single(),`Link ${item.key} receipt media`);
      evidenceId=evidence.id;
      const document=await checked(client.from("expense_documents").select("id")
        .eq("source_evidence_id",evidenceId).single(),`Find ${item.key} expense document`);
      documentId=document.id;
    }else{
      const document=await checked(client.from("expense_documents").insert({
        organization_id:plan.organization.id,intake_id:intakeId,storage_bucket:storageBucket,
        storage_path:storagePath,declared_mime:"image/png",detected_mime:"image/png",
        claimed_byte_size:bytes.length,byte_size:bytes.length,
        claimed_sha256:sha256,sha256,status:"ready",verified_at:new Date().toISOString(),
      }).select("id").single(),`Link ${item.key} app receipt`);
      documentId=document.id;
    }
    const resolved=await checked(directorActor.rpc("resolve_finance_intake",{
      p_intake_id:intakeId,p_site_id:site.id,p_category:item.category,p_vendor:item.vendor,
      p_expense_date:item.date,p_payment_method:item.paymentMethod,p_currency:"CAD",
      p_subtotal:null,p_tax:null,p_total:item.cents/100,
      p_description:`Synthetic ${item.category.replaceAll("_"," ")} receipt`,
      p_project_reference:item.projectReference,p_reason:"Synthetic source reviewed",
    }),`Review ${item.key} expense`);
    let postingIds=[];
    if(item.approved){
      await checked(directorActor.rpc("approve_finance_expense",{p_claim_id:resolved}),
        `Approve ${item.key} expense`);
      postingIds=ids(await checked(client.from("expense_postings").select("id")
        .eq("claim_id",resolved),`Read ${item.key} postings`));
    }else{
      const duplicate=await directorActor.rpc("approve_finance_expense",{p_claim_id:resolved});
      if(!duplicate.error||!duplicate.error.message.includes("Duplicate receipt"))
        throw new Error("Duplicate receipt unexpectedly posted.");
    }
    registry.expenses.rows.push({key:item.key,intakeId,claimId:resolved,documentId,messageId,
      eventId,jobId,evidenceId,storageBucket,storagePath,postingIds});
    await atomicJson(join(directory,"registry.json"),registry);
  }
}
async function generateTime(client,plan,registry,directory){
  if(!plan.timeCases)return;
  const director=plan.personas.find(persona=>persona.role==="organization_administrator");
  const directorId=registry.authUserIds[plan.personas.indexOf(director)];
  const actor=await personaClient(directorId);
  const primary=plan.timeCases[0].workerId;
  const replacement=plan.timeCases.find(item=>item.key==="worker_swap_replacement").workerId;
  registry.time={rateIds:[],rows:[]};
  await atomicJson(join(directory,"registry.json"),registry);
  for(const [worker,rateType,cost,from,reference] of [
    [primary,"regular",24,"2026-06-01","DEMO-REG-1"],
    [primary,"overtime",36,"2026-06-01","DEMO-OT"],
    [replacement,"regular",24,"2026-06-01","DEMO-SWAP"],
    [primary,"regular",27,"2026-08-01","DEMO-REG-2"],
  ]){
    const rateId=await checked(actor.rpc("set_worker_cost_rate",{
      p_worker_id:worker,p_rate_type:rateType,p_hourly_cost:cost,p_currency:"CAD",
      p_effective_from:from,p_effective_to:null,p_reference:reference,
      p_reason:"Synthetic effective rate source",
    }),`Set ${reference} rate`);
    registry.time.rateIds.push(rateId);
    await atomicJson(join(directory,"registry.json"),registry);
  }
  for(const item of plan.timeCases){
    let timeEntryId;
    const attendanceIds=[];
    let shiftId=item.shiftId;
    let createdShiftId=null;
    let start=item.start;
    let end=item.end;
    if(item.useContractShift){
      const source=await checked(client.from("shifts").select("id,starts_at,ends_at")
        .eq("organization_id",plan.organization.id)
        .eq("contract_version_id",plan.contract.versions[0].id)
        .order("starts_at").limit(1).single(),"Find activated recurring contract shift");
      shiftId=source.id;start=source.starts_at;end=source.ends_at;
    }
    if(shiftId){
      if(!item.useContractShift&&!item.reuseShift){
        await checked(client.from("shifts").insert({id:shiftId,organization_id:plan.organization.id,
          site_id:item.siteId,starts_at:start,ends_at:end??`${item.date}T16:00:00Z`,
          state:"completed"}),`Create ${item.key} shift`);
        createdShiftId=shiftId;
      }
      await checked(client.from("shift_assignments").insert({id:item.assignmentId,
        organization_id:plan.organization.id,site_id:item.siteId,shift_id:shiftId,
        worker_id:item.workerId,state:item.key==="worker_swap_original"?"cancelled":"completed"}),
      `Assign ${item.key} worker`);
      for(const [type,at] of [["check_in",start],["check_out",end]].filter(([,at])=>at)){
        const eventId=sqlId(`time-attendance:${item.assignmentId}:${type}`);
        await checked(client.from("attendance_events").insert({id:eventId,
          organization_id:plan.organization.id,site_id:item.siteId,
          assignment_id:item.assignmentId,event_type:type,occurred_at:at,recorded_by:directorId}),
        `Record ${item.key} ${type}`);
        attendanceIds.push(eventId);
      }
      timeEntryId=await checked(actor.rpc("derive_shift_time_entry",{p_assignment_id:item.assignmentId}),
        `Derive ${item.key} time`);
    }else{
      timeEntryId=await checked(actor.rpc("create_manual_time_entry",{
        p_site_id:item.siteId,p_worker_id:item.workerId,p_work_date:item.date,
        p_hours:item.hours,p_cost_type:item.costType,p_project_reference:item.projectReference,
        p_contract_version_id:null,p_task_run_id:null,p_reason:"Synthetic one-off project source",
      }),"Create manual project time");
      if(plan.projects)await checked(actor.rpc("assign_finance_project_time",{
        p_project_id:plan.projects[0].id,p_time_entry_id:timeEntryId}),"Link synthetic project time");
    }
    let ledgerId=null;
    if(item.status==="posted"){
      const hours=item.hours??(new Date(end)-new Date(start))/3600000;
      await checked(actor.rpc("review_time_entry",{
        p_time_entry_id:timeEntryId,p_action:"approve",p_hours:hours,
        p_cost_type:item.costType,p_reason:"Synthetic attendance or project reviewed",
      }),`Approve ${item.key} hours`);
      ledgerId=await checked(actor.rpc("post_approved_time_cost",{p_time_entry_id:timeEntryId}),
        `Post ${item.key} cost`);
    }
    registry.time.rows.push({key:item.key,shiftId:shiftId??null,createdShiftId,
      assignmentId:item.assignmentId??null,attendanceIds,timeEntryId,ledgerId});
    await atomicJson(join(directory,"registry.json"),registry);
  }
  await atomicJson(join(directory,"time-cases.json"),{
    schemaVersion:1,cases:plan.timeCases,approvedLabourCost:plan.expected.controlTotals.finance.approvedLabourCost,
    rateChanges:["DEMO-REG-1","DEMO-REG-2"],
    note:"All people and shifts are synthetic; posted cost is calculated from approved hours and effective rates."});
}
async function generateProjectDrafts(client,plan,registry,directory){
  if(!plan.projects)return;
  const director=plan.personas.find(persona=>persona.role==="organization_administrator");
  const directorId=registry.authUserIds[plan.personas.indexOf(director)];
  const actor=await personaClient(directorId);
  registry.projects={termIds:[],invoiceIds:[],linkIds:[],accounting:{
    finance_import_batches:[],finance_source_rows:[],finance_source_allocations:[]}};
  for(const item of plan.projects){
    await checked(client.from("projects").insert({id:item.id,organization_id:plan.organization.id,
      site_id:plan.sites[0].id,project_code:item.code,name:item.name,scope:item.scope,
      starts_on:plan.scenario.clock.start,currency:"CAD",created_by:directorId}),`Create ${item.code} draft`);
    await checked(actor.rpc("approve_finance_project",{p_project_id:item.id,p_pricing_model:"fixed",
      p_fixed_quote:item.quote/100,p_hourly_rate:null}),`Approve ${item.code}`);
    const term=await checked(client.from("project_revenue_terms").select("id").eq("project_id",item.id).single(),"Find project term");
    registry.projects.termIds.push(term.id);
  }
  await atomicJson(join(directory,"registry.json"),registry);
}
async function completeProjectScenario(client,plan,registry,directory){
  if(!plan.projects)return;
  const director=plan.personas.find(persona=>persona.role==="organization_administrator");
  const directorId=registry.authUserIds[plan.personas.indexOf(director)];
  const actor=await personaClient(directorId);
  const project=plan.projects[0];
  for(const row of registry.expenses.rows.filter(row=>["fuel","project-supply"].includes(row.key))){
    for(const postingId of row.postingIds) await checked(actor.rpc("assign_finance_project_source",{
      p_project_id:project.id,p_source_type:"expense",p_source_id:postingId}),`Link ${row.key} expense`);
  }
  registry.projects.linkIds=ids(await checked(client.from("project_source_links").select("id")
    .eq("organization_id",plan.organization.id),"Read synthetic project links"));
  const batchId=sqlId(`project-accounting-batch:${plan.runId}`);
  const rowId=sqlId(`project-accounting-row:${plan.runId}`);
  const allocationId=sqlId(`project-accounting-allocation:${plan.runId}`);
  await checked(client.from("finance_import_batches").insert({id:batchId,organization_id:plan.organization.id,
    source_system:"scenario_csv",source_file_name:"synthetic-project-revenue.csv",
    source_file_hash:createHash("sha256").update(`project:${plan.runId}`).digest("hex"),mapping_version:"clean-037-v1",
    currency:"CAD",service_period_start:plan.scenario.clock.start,
    service_period_end:plan.scenario.clock.end,state:"accepted",completeness:"complete",
    accepted_by:directorId,accepted_at:new Date().toISOString()}),"Create accepted synthetic accounting batch");
  await checked(client.from("finance_source_rows").insert({id:rowId,organization_id:plan.organization.id,
    import_batch_id:batchId,source_row_number:1,source_document_id:`DEMO-${project.code}`,
    source_line_id:"1",site_id:plan.sites[0].id,job_reference:project.code,
    service_period:plan.scenario.clock.start,accounting_period:plan.scenario.clock.start,
    currency:"CAD",category:"revenue",amount:project.recognized/100,
    approval_state:"approved",recognition_state:"actual",allocation_state:"allocated",
    raw_row:{synthetic:true,scenario:plan.scenario.scenarioId}}),"Create synthetic revenue source row");
  await checked(client.from("finance_source_allocations").insert({id:allocationId,organization_id:plan.organization.id,
    source_row_id:rowId,site_id:plan.sites[0].id,job_reference:project.code,
    amount:project.recognized/100}),"Allocate synthetic revenue to project");
  registry.projects.accounting={finance_import_batches:[batchId],finance_source_rows:[rowId],
    finance_source_allocations:[allocationId]};
  const invoiceId=await checked(actor.rpc("record_finance_project_invoice",{
    p_project_id:project.id,p_reference:`DEMO-${project.code}`,p_date:plan.scenario.clock.start,
    p_amount:project.quote/100}),"Record synthetic project invoice");
  registry.projects.invoiceIds.push(invoiceId);
  await checked(actor.rpc("set_finance_project_completion",{p_project_id:project.id,p_complete:true}),
    "Close synthetic project costs");
  await atomicJson(join(directory,"registry.json"),registry);
}
async function generateReconciliationScenario(client,plan,registry,directory){
  if(!plan.scenario.modules.reconciliation)return;
  const director=plan.personas.find(persona=>persona.role==="organization_administrator");
  const actor=await personaClient(registry.authUserIds[plan.personas.indexOf(director)]);
  const directorId=registry.authUserIds[plan.personas.indexOf(director)];
  const fuel=registry.expenses.rows.find(row=>row.key==="fuel").postingIds[0];
  const repair=registry.expenses.rows.find(row=>row.key==="repair").postingIds[0];
  const postingRows=await checked(client.from("expense_postings").select("id,amount,site_id,project_id,category")
    .eq("organization_id",plan.organization.id).in("id",[fuel,repair]),"Read reconciliation posting sources");
  const byId=new Map(postingRows.map(row=>[row.id,row]));
  const batchId=sqlId(`reconciliation-june-batch:${plan.runId}`);
  const lateBatchId=sqlId(`reconciliation-late-batch:${plan.runId}`);
  const accounting={finance_import_batches:[batchId,lateBatchId],finance_source_rows:[],finance_source_allocations:[]};
  const makeRow=(key,number,post,amount,reference)=>({
    id:sqlId(`reconciliation-row-${key}:${plan.runId}`),organization_id:plan.organization.id,
    import_batch_id:batchId,source_row_number:number,source_document_id:`SYN-${key}-${plan.runId}`,
    source_line_id:"1",site_id:post.site_id,service_period:"2026-06-01",accounting_period:"2026-06-30",
    currency:"CAD",category:post.category==="equipment_repair"?"repairs":post.category==="supplies"?"supplies":"other_direct_cost",
    amount,approval_state:"approved",recognition_state:"actual",allocation_state:"allocated",
    raw_row:reference?{synthetic:true,operational_id:reference}:{synthetic:true},
  });
  const rows=[makeRow("fuel-a",1,byId.get(fuel),byId.get(fuel).amount,fuel),
    makeRow("fuel-b",2,byId.get(fuel),byId.get(fuel).amount,fuel),
    makeRow("repair",3,byId.get(repair),byId.get(repair).amount,repair),
    makeRow("unmatched",4,byId.get(repair),9.99,null)];
  const lateRowId=sqlId(`reconciliation-late-row:${plan.runId}`);
  const lateAllocation=sqlId(`reconciliation-late-allocation:${plan.runId}`);
  accounting.finance_source_rows.push(...rows.map(row=>row.id),lateRowId);
  accounting.finance_source_allocations.push(...rows.map((_,index)=>
    sqlId(`reconciliation-allocation-${index}:${plan.runId}`)),lateAllocation);
  registry.reconciliation={juneId:null,julyId:null,linkIds:[],accounting};
  await atomicJson(join(directory,"registry.json"),registry);
  await checked(client.from("finance_import_batches").insert({id:batchId,organization_id:plan.organization.id,
    source_system:"scenario_csv",source_file_name:"synthetic-reconciliation-june.csv",
    source_file_hash:createHash("sha256").update(`reconciliation:${plan.runId}`).digest("hex"),
    mapping_version:"clean-038-v1",currency:"CAD",service_period_start:"2026-06-01",service_period_end:"2026-06-30",
    state:"accepted",completeness:"complete",accepted_by:directorId,accepted_at:new Date().toISOString()}),
  "Create reconciliation accounting batch");
  await checked(client.from("finance_source_rows").insert(rows),"Create reconciliation source rows");
  const allocations=rows.map((row,index)=>({id:sqlId(`reconciliation-allocation-${index}:${plan.runId}`),
    organization_id:plan.organization.id,source_row_id:row.id,site_id:row.site_id,
    amount:row.amount,project_id:index<2?byId.get(fuel).project_id:index===2?byId.get(repair).project_id:null}));
  await checked(client.from("finance_source_allocations").insert(allocations),"Allocate reconciliation source rows");
  const juneId=await checked(actor.rpc("open_finance_period",{p_organization_id:plan.organization.id,
    p_period_start:"2026-06-01"}),"Open June reconciliation");
  registry.reconciliation.juneId=juneId;
  await atomicJson(join(directory,"registry.json"),registry);
  const matched=await checked(actor.rpc("run_finance_auto_match",{p_period_id:juneId}),"Auto match unique source");
  if(matched!==1)throw new Error(`Expected one unique June match, received ${matched}.`);
  registry.reconciliation.linkIds=ids(await checked(client.from("finance_reconciliation_links")
    .select("id").eq("organization_id",plan.organization.id),"Record synthetic match IDs"));
  await atomicJson(join(directory,"registry.json"),registry);
  const julyId=await checked(actor.rpc("open_finance_period",{p_organization_id:plan.organization.id,
    p_period_start:"2026-07-01"}),"Open July close period");
  registry.reconciliation.julyId=julyId;
  await atomicJson(join(directory,"registry.json"),registry);
  await checked(actor.rpc("review_finance_period",{p_period_id:julyId}),"Review July period");
  await checked(actor.rpc("close_finance_period",{p_period_id:julyId}),"Close July period");
  const lateRow={...makeRow("late-july",1,byId.get(repair),12.34,null),
    id:lateRowId,import_batch_id:lateBatchId,
    service_period:"2026-07-01",accounting_period:"2026-07-31",category:"revenue"};
  await checked(client.from("finance_import_batches").insert({id:lateBatchId,organization_id:plan.organization.id,
    source_system:"scenario_csv",source_file_name:"synthetic-late-july.csv",
    source_file_hash:createHash("sha256").update(`reconciliation-late:${plan.runId}`).digest("hex"),
    mapping_version:"clean-038-v1",currency:"CAD",service_period_start:"2026-07-01",service_period_end:"2026-07-31",
    state:"accepted",completeness:"complete",accepted_by:directorId,accepted_at:new Date().toISOString()}),
  "Create late accounting batch");
  await checked(client.from("finance_source_rows").insert(lateRow),"Create late accounting row");
  await checked(client.from("finance_source_allocations").insert({id:lateAllocation,organization_id:plan.organization.id,
    source_row_id:lateRow.id,site_id:lateRow.site_id,amount:lateRow.amount}),"Allocate late accounting row");
  await atomicJson(join(directory,"registry.json"),registry);
  if (plan.scenario.generatorVersion >= 7) {
    const augustExpenses = registry.expenses.rows.filter(row => ["august-supply", "august-repair"].includes(row.key));
    if (augustExpenses.length !== 2) throw new Error("August showcase expense sources are missing.");
    const expenseIds = augustExpenses.flatMap(row => row.postingIds);
    const costs = await checked(client.from("expense_postings").select("id,site_id,project_id,category,amount")
      .eq("organization_id", plan.organization.id).in("id", expenseIds), "Read August expense postings");
    const projectTime = registry.time.rows.find(row => row.key === "manual_project");
    const labour = await checked(client.from("labor_cost_entries").select("id,site_id,project_id,total_cost")
      .eq("organization_id", plan.organization.id).eq("id", projectTime.ledgerId).single(), "Read August project labour");
    const costSources = [
      { key: "labour", entityType: "labor_cost_entry", entityId: labour.id,
        siteId: labour.site_id, projectId: labour.project_id, category: "direct_labour", amount: Number(labour.total_cost) },
      ...costs.map(row => ({ key: row.category, entityType: "expense_posting", entityId: row.id,
        siteId: row.site_id, projectId: row.project_id,
        category: row.category === "equipment_repair" ? "repairs" : "supplies", amount: Number(row.amount) })),
    ];
    const augustBatchId = sqlId(`reconciliation-august-batch:${plan.runId}`);
    const revenueSources = [
      { key: "contract-revenue", siteId: plan.sites[0].id, amount: Number(plan.contract.terms[0].amount) },
      { key: "second-site-revenue", siteId: plan.sites[1].id, amount: 950.00 },
    ];
    const sourceRows = [...costSources.map((row, index) => ({ id: sqlId(`reconciliation-august-${row.key}-${index}:${plan.runId}`),
      organization_id: plan.organization.id, import_batch_id: augustBatchId,
      source_row_number: index + 1, source_document_id: `SYN-AUG-COST-${index + 1}`,
      source_line_id: "1", site_id: row.siteId, service_period: "2026-08-01", accounting_period: "2026-08-31",
      currency: "CAD", category: row.category, amount: row.amount, approval_state: "approved",
      recognition_state: "actual", allocation_state: "allocated", raw_row: { synthetic: true, operational_id: row.entityId } })),
      ...revenueSources.map((row, index) => ({ id: sqlId(`reconciliation-august-revenue-${index}:${plan.runId}`),
        organization_id: plan.organization.id, import_batch_id: augustBatchId,
        source_row_number: costSources.length + index + 1, source_document_id: `SYN-AUG-REVENUE-${index + 1}`,
        source_line_id: "1", site_id: row.siteId, service_period: "2026-08-01", accounting_period: "2026-08-31",
        currency: "CAD", category: "revenue", amount: row.amount, approval_state: "approved",
        recognition_state: "actual", allocation_state: "allocated", raw_row: { synthetic: true } }))];
    const augustAllocations = sourceRows.map((row, index) => ({
      id: sqlId(`reconciliation-august-allocation-${index}:${plan.runId}`),
      organization_id: plan.organization.id, source_row_id: row.id, site_id: row.site_id,
      amount: row.amount, project_id: index < costSources.length ? costSources[index].projectId : null,
    }));
    accounting.finance_import_batches.push(augustBatchId);
    accounting.finance_source_rows.push(...sourceRows.map(row => row.id));
    accounting.finance_source_allocations.push(...augustAllocations.map(row => row.id));
    registry.reconciliation.augustId = null;
    registry.reconciliation.financeReconciliationIds = [];
    await atomicJson(join(directory, "registry.json"), registry);
    await checked(client.from("finance_import_batches").insert({ id: augustBatchId,
      organization_id: plan.organization.id, source_system: "scenario_csv",
      source_file_name: "synthetic-august-showcase.csv",
      source_file_hash: createHash("sha256").update(`reconciliation-august:${plan.runId}`).digest("hex"),
      mapping_version: "clean-039-v1", currency: "CAD", service_period_start: "2026-08-01",
      service_period_end: "2026-08-31", state: "preview" }), "Stage August showcase accounting batch");
    await checked(client.from("finance_source_rows").insert(sourceRows), "Stage August showcase source rows");
    await checked(client.from("finance_source_allocations").insert(augustAllocations), "Allocate August showcase sources");
    await checked(actor.rpc("accept_finance_import", { p_batch_id: augustBatchId, p_completeness: "complete" }),
      "Accept complete August accounting source");
    registry.reconciliation.financeReconciliationIds = ids(await checked(client.from("finance_reconciliations")
      .select("id").eq("organization_id", plan.organization.id).eq("import_batch_id", augustBatchId),
    "Record August accounting totals"));
    await atomicJson(join(directory, "registry.json"), registry);
    const augustId = await checked(actor.rpc("open_finance_period", { p_organization_id: plan.organization.id,
      p_period_start: "2026-08-01" }), "Open August showcase period");
    registry.reconciliation.augustId = augustId;
    await atomicJson(join(directory, "registry.json"), registry);
    for (const [index, cost] of costSources.entries()) {
      await checked(actor.rpc("match_finance_allocation", { p_period_id: augustId,
        p_allocation_id: augustAllocations[index].id, p_type: cost.entityType,
        p_entity_id: cost.entityId, p_amount: cost.amount,
        p_reason: "Synthetic August source-to-operational match" }), `Match August ${cost.key}`);
    }
    registry.reconciliation.linkIds = ids(await checked(client.from("finance_reconciliation_links")
      .select("id").eq("organization_id", plan.organization.id), "Record August match IDs"));
    await atomicJson(join(directory, "registry.json"), registry);
    await checked(actor.rpc("review_finance_period", { p_period_id: augustId }), "Review August showcase period");
    await checked(actor.rpc("close_finance_period", { p_period_id: augustId }), "Close August showcase period");
  }
}
async function assertReconciliationScope(client,plan,registry,allowPartial){
  const planned=registry.reconciliation;
  for(const table of ["finance_periods","finance_reconciliation_links"]){
    const actual=await rowsFor(client,table,plan.organization.id);
    const expected=table==="finance_periods"?[planned?.juneId,planned?.julyId,planned?.augustId].filter(Boolean):
      planned?.linkIds??[];
    assertIdSet(actual,expected,table,allowPartial);
  }
  if(plan.scenario.generatorVersion>=7)assertIdSet(await rowsFor(client,"finance_reconciliations",plan.organization.id),
    planned?.financeReconciliationIds??[],"finance_reconciliations",allowPartial);
  if(allowPartial||!planned)return;
  if(planned.linkIds.length!==(plan.scenario.generatorVersion>=7?4:1))throw new Error("Reconciliation match count differs from scenario plan.");
  const director=plan.personas.find(persona=>persona.role==="organization_administrator");
  const actor=await personaClient(registry.authUserIds[plan.personas.indexOf(director)]);
  const june=await checked(actor.rpc("list_finance_match_candidates",{p_period_id:planned.juneId}),"Read June proposals");
  if(june.filter(row=>row.ambiguous).length!==2)throw new Error("Expected two ambiguous duplicate-source proposals.");
  const periods=await checked(actor.rpc("list_finance_period_status"),"Read period status");
  const july=periods.find(row=>row.period_id===planned.julyId);
  if(july?.state!=="closed"||!july.stale)throw new Error("Late July batch must make the closed snapshot stale.");
  if(plan.scenario.generatorVersion>=7){
    const august=periods.find(row=>row.period_id===planned.augustId);
    if(august?.state!=="closed"||august.stale||august.metrics.coverage!=="complete")
      throw new Error("August two-site showcase must be completely closed and current.");
    const actuals=await checked(client.from("finance_reconciliations")
      .select("site_id,recognized_revenue,direct_labour,supplies,repairs,direct_contribution,completeness,currency")
      .eq("organization_id",plan.organization.id).eq("service_period","2026-08-01")
      .eq("is_current",true),"Read August site contributions");
    if(actuals.length!==plan.expected.reconciliation.showcaseSites.length)
      throw new Error("August showcase site count differs from the manifest.");
    for(const expected of plan.expected.reconciliation.showcaseSites){
      const actual=actuals.find(row=>row.site_id===expected.siteId);
      if(!actual||actual.currency!==expected.currency||actual.completeness!=="complete"||
        Number(actual.recognized_revenue).toFixed(2)!==expected.recognizedRevenue||
        Number(actual.direct_labour).toFixed(2)!==expected.directLabour||
        Number(actual.supplies).toFixed(2)!==expected.supplies||
        Number(actual.repairs).toFixed(2)!==expected.repairs||
        Number(actual.direct_contribution).toFixed(2)!==expected.contribution)
        throw new Error(`August site ${expected.siteId} differs from source-backed showcase controls.`);
    }
  }
}
async function generate(name, seed) {
  const plan = await loadPlan(name, seed); // Validate before any writes.
  if (hostedTarget) {
    if (plan.organization.id !== hostedTarget.organizationId) throw new Error("Explicit hosted organization ID differs from the deterministic plan.");
    hostedTarget.plan = plan;
  }
  const directory = join(outputRoot, name);
  const registryPath = join(directory, "registry.json");
  if (await exists(registryPath)) throw new Error(`Scenario ${name} already has a registry. Run demo:assert or demo:reset first.`);
  const client = connectTarget();
  if (hostedTarget) {
    const recorded = await checked(client.from("demo_scenario_runs").select("run_id,status").eq("organization_id", plan.organization.id).maybeSingle(), "Check hosted registry");
    if (recorded) throw new Error(`Hosted organization already has scenario run ${recorded.run_id} (${recorded.status}).`);
  }
  const existing = await checked(client.from("organizations").select("id").eq("id", plan.organization.id).maybeSingle(), "Check scenario ID");
  if (existing) throw new Error("Scenario organization ID already exists without a registry; refusing to adopt it.");
  await mkdir(directory, { recursive: true });
  const registry = { scenarioId: name, runId: plan.runId, seed: plan.scenario.seed, generatorVersion: plan.scenario.generatorVersion, organizationId: plan.organization.id, status: "generating", createdAt: new Date().toISOString(), authUserIds: [] };
  if (hostedTarget) hostedTarget.registry = registry;
  await atomicJson(registryPath, registry);
  await atomicJson(join(directory, "expected.json"), plan.expected);
  try {
    await writeContractDocumentPack(directory, plan.contract);
    await writeExpenseReceiptPack(directory,plan);
    await checked(client.from("organizations").insert(plan.organization), "Create scenario organization");
    await checked(client.from("clients").insert(plan.client), "Create scenario client");
    await checked(client.from("sites").insert(plan.sites), "Create scenario sites");
    await checked(client.from("workers").insert(plan.workers.map((worker) => ({ id: worker.id, organization_id: worker.organization_id, display_name: worker.display_name, active: worker.active }))), "Create scenario workers");
    await checked(client.from("worker_site_permissions").insert(plan.workerPermissions), "Grant worker sites");
    for (const persona of plan.personas) {
      const result = await checked(client.auth.admin.createUser({
        email: persona.email, email_confirm: true,
        ...(hostedTarget ? { password: localAuth.password } : {}),
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
    await generateContractDocuments(client, plan, registry, directory);
    await generateProjectDrafts(client,plan,registry,directory);
    await generateExpenses(client,plan,registry,directory);
    await generateTime(client,plan,registry,directory);
    await completeProjectScenario(client,plan,registry,directory);
    await generateReconciliationScenario(client,plan,registry,directory);
    await assertScope(client, plan, false,registry);
    registry.status = "ready";
    await atomicJson(registryPath, registry);
  console.log(`Generated ${name} (seed ${plan.scenario.seed}): ${plan.sites.length} sites, ${plan.workers.length} workers, ${plan.personas.length} personas${plan.contract ? ", one approved contract and future amendment" : ""}${plan.expenseCases ? `, ${plan.expenseCases.length} expense sources` : ""}${plan.timeCases ? `, ${plan.timeCases.length} time cases` : ""}.`);
  } catch (error) {
    registry.status = "partial";
    await atomicJson(registryPath, registry);
    throw error;
  }
}
async function loadRegistry(name) {
  const directory = join(outputRoot, name);
  const path = join(directory, "registry.json");
  let registry;
  if (hostedTarget) {
    const client = connectTarget();
    const row = await checked(client.from("demo_scenario_runs").select("registry").eq("organization_id", hostedTarget.organizationId)
      .eq("project_ref", hostedTarget.projectRef).maybeSingle(), "Read hosted scenario registry");
    if (!row) throw new Error(`No hosted registry for ${name} in the specified project and organization.`);
    registry = row.registry;
    if (await exists(path) && !isDeepStrictEqual(await json(path), registry))
      throw new Error("Local and hosted registries differ; refusing to continue.");
  } else {
    if (!(await exists(path))) throw new Error(`No generated registry for ${name}.`);
    registry = await json(path);
  }
  if (registry.scenarioId !== name) throw new Error("Registry scenario ID mismatch.");
  const plan = await loadPlan(name, registry.seed);
  if (plan.organization.id !== registry.organizationId || plan.runId !== registry.runId) throw new Error("Registry identity mismatch.");
  if (hostedTarget) {
    if (hostedTarget.organizationId !== plan.organization.id) throw new Error("Hosted organization ID differs from scenario registry.");
    hostedTarget.plan = plan;
    hostedTarget.registry = registry;
    hostedTarget.registryPersisted = true;
    await mkdir(directory, { recursive: true });
    if (!(await exists(path))) await atomicJson(path, registry);
  }
  return { directory, registry, plan };
}
async function preflight(name, seed) {
  const plan = await loadPlan(name, seed);
  if (hostedTarget && plan.organization.id !== hostedTarget.organizationId)
    throw new Error("Explicit hosted organization ID differs from the deterministic plan.");
  const client = connectTarget();
  const idChecks = [
    ["clients", [plan.client.id]], ["sites", ids(plan.sites)],
    ["workers", ids(plan.workers)], ["memberships", plan.personas.map(persona => persona.membershipId)],
    ["member_site_access", ids(plan.memberGrants)],
  ];
  const [org, slugOrg, run, runIdOwner, occupiedIds, users] = await Promise.all([
    checked(client.from("organizations").select("id,slug").eq("id", plan.organization.id).maybeSingle(), "Check scenario organization"),
    checked(client.from("organizations").select("id,slug").eq("slug", plan.organization.slug).maybeSingle(), "Check scenario slug"),
    hostedTarget ? checked(client.from("demo_scenario_runs").select("run_id,status,project_ref").eq("organization_id", plan.organization.id).maybeSingle(), "Check hosted registry") : null,
    hostedTarget ? checked(client.from("demo_scenario_runs").select("run_id,organization_id").eq("run_id", plan.runId).maybeSingle(), "Check hosted run ID") : null,
    Promise.all(idChecks.map(async ([table, planned]) => ({ table, rows: await checked(client.from(table).select("id,organization_id").in("id", planned), `Check ${table} IDs`) }))),
    (async () => { const found = []; for (let page = 1; page <= 20; page++) {
      const result = await checked(client.auth.admin.listUsers({ page, perPage: 100 }), "Check scenario email collisions");
      found.push(...result.users.filter(user => plan.personas.some(persona => persona.email === user.email)));
      if (result.users.length < 100) break;
    } return found; })(),
  ]);
  const collisions = [
    ...(org ? [`organization ${org.id} (${org.slug}) exists`] : []),
    ...(slugOrg && slugOrg.id !== org?.id ? [`organization slug ${slugOrg.slug} belongs to ${slugOrg.id}`] : []),
    ...(run ? [`registry ${run.run_id} is ${run.status}`] : []),
    ...(runIdOwner && runIdOwner.organization_id !== plan.organization.id ? [`run ID ${runIdOwner.run_id} belongs to ${runIdOwner.organization_id}`] : []),
    ...occupiedIds.flatMap(group => group.rows.map(row => `${group.table} ID ${row.id} already belongs to ${row.organization_id}`)),
    ...users.map(user => `persona email ${user.email} already exists`),
  ];
  const report = { target: hostedTarget ? `hosted ${hostedTarget.projectRef}` : "local",
    scenarioId: name, runId: plan.runId, organizationId: plan.organization.id,
    seed: plan.scenario.seed, generatorVersion: plan.scenario.generatorVersion,
    sites: plan.sites.map(site => ({ id: site.id, name: site.name })),
    personas: plan.personas.map(persona => ({ email: persona.email, role: persona.role })),
    entityCounts: plan.expected.entityCounts, expected: plan.expected.controlTotals,
    expectedExceptions: plan.expected.expectedExceptions, collisions };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (collisions.length) throw new Error("Preflight found existing IDs or users; refusing generation.");
}
async function assertScenario(name) {
  const { directory, registry, plan } = await loadRegistry(name);
  if (registry.status !== "ready") throw new Error(`Scenario ${name} is ${registry.status}; reset and regenerate.`);
  const client = connectTarget();
  await assertScope(client, plan, false,registry);
  const users = await listScenarioUsers(client, plan);
  if (users.length !== plan.personas.length) throw new Error("Scenario Auth persona count differs from expected.");
  if (hostedTarget) {
    await writeContractDocumentPack(directory, plan.contract);
    await writeExpenseReceiptPack(directory, plan);
  }
  if (plan.contract) {
    const pack = await json(join(directory, "contract-documents.json"));
    for (const [file, expected] of Object.entries(pack.files)) {
      const bytes = await readFile(join(directory, file));
      if (hashFixture(bytes) !== expected.sha256 || bytes.length !== expected.bytes)
        throw new Error(`Synthetic contract document ${file} differs from its manifest.`);
    }
    if (plan.scenario.generatorVersion >= 7) {
      for (const document of registry.contractDocuments ?? []) {
        const metadata = await checked(client.from("contract_documents")
          .select("id,sha256,status,storage_path").eq("organization_id", plan.organization.id)
          .eq("id", document.id).single(), `Read ${document.file} document record`);
        const download = await checked(client.storage.from("contract-documents")
          .download(document.storagePath), `Download ${document.file}`);
        const bytes = new Uint8Array(await download.arrayBuffer());
        if (metadata.status !== "ready" || metadata.storage_path !== document.storagePath ||
          metadata.sha256 !== hashFixture(bytes) || metadata.sha256 !== pack.files[document.file]?.sha256)
          throw new Error(`Hosted synthetic contract document ${document.file} differs from its source pack.`);
      }
    }
  }
  if(plan.expenseCases){
    const pack=await json(join(directory,"expense-receipts.json"));
    for(const [file,expected] of Object.entries(pack.files)){
      const bytes=await readFile(join(directory,file));
      if(receiptSha(bytes)!==expected.sha256||bytes.length!==expected.bytes)
        throw new Error(`Synthetic receipt ${file} differs from the manifest.`);
    }
  }
  if(plan.timeCases){
    const pack=await json(join(directory,"time-cases.json"));
    if(JSON.stringify(pack.cases)!==JSON.stringify(plan.timeCases)||
      pack.approvedLabourCost!==plan.expected.controlTotals.finance.approvedLabourCost)
      throw new Error("Synthetic time source pack differs from deterministic plan.");
  }
  console.log(`Scenario ${name} matches its manifest: ${plan.sites.length} sites, ${plan.workers.length} workers, ${plan.personas.length} personas${plan.contract ? `, ${plan.contract.expected.expectedRevenue} CAD current expected revenue` : ""}${plan.expenseCases ? `, ${plan.expected.controlTotals.finance.approvedExpenseCost} CAD approved expense cost` : ""}.`);
}
async function reset(name) {
  const { directory, registry, plan } = await loadRegistry(name);
  const client = connectTarget();
  const org = await assertScope(client, plan, true,registry);
  const scenarioUsers = await listScenarioUsers(client, plan);
  assertIdSet(scenarioUsers, registry.authUserIds, "Auth users", registry.status !== "ready");
  if (org) await countAttached(plan.organization.id, Boolean(plan.contract),Boolean(plan.expenseCases),Boolean(plan.timeCases),Boolean(plan.projects));
  registry.status = "resetting";
  await atomicJson(join(directory, "registry.json"), registry);
  if(plan.scenario.modules.reconciliation){
    for(const table of ["finance_reconciliation_events","finance_reconciliation_links",
      "finance_period_events","finance_periods"])
      await checked(client.from(table).delete().eq("organization_id",plan.organization.id),
        `Delete scenario ${table}`);
  }
  if(plan.projects){
    const scopedOrg=plan.organization.id;
    if(!/^[0-9a-f-]{36}$/.test(scopedOrg))throw new Error("Invalid project scenario organization ID.");
    const cleanup=`begin;
      delete from public.project_source_links where organization_id='${scopedOrg}';
      delete from public.project_invoices where organization_id='${scopedOrg}';
      delete from public.project_billable_approvals where organization_id='${scopedOrg}';
      delete from public.finance_reconciliations where organization_id='${scopedOrg}';
      delete from public.finance_source_allocations where organization_id='${scopedOrg}';
      delete from public.finance_source_rows where organization_id='${scopedOrg}';
      delete from public.finance_import_batches where organization_id='${scopedOrg}';
      commit;`;
    execFileSync("psql",[localDatabaseUrl,"-v","ON_ERROR_STOP=1","-c",cleanup],
      {encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  }
  if(plan.timeCases){
    const scopedOrg=plan.organization.id;
    if(!/^[0-9a-f-]{36}$/.test(scopedOrg))throw new Error("Invalid time scenario organization ID.");
    const localCleanup=`begin;
      set local session_replication_role=replica;
      delete from public.time_entry_events where organization_id='${scopedOrg}';
      delete from public.worker_cost_rate_events where organization_id='${scopedOrg}';
      delete from public.labor_cost_entries where organization_id='${scopedOrg}';
      delete from public.time_entries where organization_id='${scopedOrg}';
      delete from public.worker_cost_rates where organization_id='${scopedOrg}';
      commit;`;
    execFileSync("psql",[localDatabaseUrl,"-v","ON_ERROR_STOP=1","-c",localCleanup],
      {encoding:"utf8",stdio:["ignore","pipe","pipe"]});
    for(const table of ["attendance_events","shift_assignments","shifts"]){
      const planned=registry.time?.rows.flatMap(row=>table==="attendance_events"?row.attendanceIds??[]:
        [table==="shift_assignments"?row.assignmentId:row.createdShiftId]).filter(Boolean)??[];
      if(planned.length)await checked(client.from(table).delete().eq("organization_id",plan.organization.id)
        .in("id",planned),`Delete scenario ${table}`);
    }
  }
  if(plan.expenseCases){
    for(const row of registry.expenses?.rows??[]){
      await checked(client.storage.from(row.storageBucket).remove([row.storagePath]),
        `Remove ${row.key} receipt`);
    }
    // The local-only factory removes its preflight-verified organization in one
    // transaction. Normal service/browser writes can never bypass immutability.
    const scopedOrg=plan.organization.id;
    if(!/^[0-9a-f-]{36}$/.test(scopedOrg))throw new Error("Invalid scenario organization ID.");
    const localCleanup=`begin;
      alter table public.expense_postings disable trigger expense_postings_immutable;
      alter table public.expense_audit_events disable trigger expense_audit_immutable;
      delete from public.expense_postings where organization_id='${scopedOrg}';
      delete from public.expense_audit_events where organization_id='${scopedOrg}';
      alter table public.expense_postings enable trigger expense_postings_immutable;
      alter table public.expense_audit_events enable trigger expense_audit_immutable;
      commit;`;
    execFileSync("psql",[localDatabaseUrl,"-v","ON_ERROR_STOP=1","-c",localCleanup],
      {encoding:"utf8",stdio:["ignore","pipe","pipe"]});
    for(const table of ["expense_allocations",
      "expense_items","expense_claims","expense_documents","finance_intake_items",
      "task_evidence","external_message_media","external_message_contexts","external_messages",
      "processing_jobs","integration_webhook_events","integration_accounts"]){
      await checked(client.from(table).delete().eq("organization_id",plan.organization.id),
        `Delete ${table}`);
    }
  }
  if(plan.projects){
    await checked(client.from("project_revenue_terms").delete().eq("organization_id",plan.organization.id),"Delete project terms");
    await checked(client.from("projects").delete().eq("organization_id",plan.organization.id),"Delete projects");
  }
  if (plan.contract) {
    if (registry.contractDocuments?.length) await checked(client.storage.from("contract-documents")
      .remove(registry.contractDocuments.map(item => item.storagePath)), "Remove synthetic contract documents");
    for (const table of ["contract_documents", "contract_events", "contract_revenue_expectations", "sla_definitions",
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
  for (const user of scenarioUsers) await checked(client.auth.admin.deleteUser(user.id), `Delete persona ${user.email}`);
  await rm(directory, { recursive: true, force: true });
  if (hostedTarget) await checked(client.from("demo_scenario_runs").delete().eq("run_id", plan.runId)
    .eq("organization_id", plan.organization.id).eq("project_ref", hostedTarget.projectRef), "Delete hosted scenario registry");
  console.log(`Reset ${name}; only registry-listed base records and tagged scenario Auth users were removed.`);
}
async function presenter(name) {
  const { registry, plan } = await loadRegistry(name);
  if (registry.status !== "ready") throw new Error(`Scenario ${name} is not ready.`);
  const lines = [
    `# ${name} presenter guide (${plan.expected.stage})`, "",
    "All names and records are synthetic demo references; no customer relationship or measured performance is implied.", "",
    `Seed: ${plan.scenario.seed}. Sites: ${plan.sites.map((site) => site.name).join(", ")}.`,
    "Run npm run demo:assert -- " + name + " before presenting.",
    "Persona Auth records have no password until a protected provisioning step sets one.",
    plan.contract
      ? `Contract ${plan.contract.identity.code}: fixed monthly source ${plan.contract.terms[0].amount} CAD, future amendment ${plan.contract.terms[1].amount} CAD from ${plan.contract.expected.amendmentDate}. Expected current revenue ${plan.contract.expected.expectedRevenue} CAD; inspect /finance/contracts.`
      : "Finance, contracts, expenses, time, projects and reconciliation journeys are not generated by Stage A.",
    ...(plan.contract ? [
      `Document files: fixtures/generated/${name}/contract-source.pdf, contract-amendment.pdf and contract-scan.png.`,
      "For upload review, create a new manual draft at the generated site, upload contract-source.pdf, run extraction, and inspect source page 1 for fee, staffing and recurring work. Payment terms is deliberately TBD and must remain unresolved until a human decision.",
      "The amendment PDF is a separate synthetic changed source. No file contains real staff, patron or customer data.",
    ] : []),
    ...(plan.expenseCases ? [
      `Expense sources: fixtures/generated/${name}/expense-receipts.json and the named synthetic PNG receipts. Approved direct expense cost ${plan.expected.controlTotals.finance.approvedExpenseCost} CAD.`,
      "Open /finance/inbox. Fuel and duplicate-fuel are separate normalized WhatsApp messages with the same receipt bytes; only fuel posts. Meal, supplies, repair and equipment purchase use app submissions.",
      "Open /finance/expenses for source text, receipt, human review, Director approval and allocated site/project posting. Equipment purchase is flagged for accounting/asset review.",
      ...plan.expenseCases.map(item => `Message ${item.key}: ${expenseMessage(item,plan.sites[item.siteIndex].name)} Attach ${item.file}. Expected ${item.approved ? "approved cost" : "duplicate warning, no cost"}.`),
    ] : []),
    ...(plan.timeCases ? [
      `Time cases: fixtures/generated/${name}/time-cases.json. Approved labour cost ${plan.expected.controlTotals.finance.approvedLabourCost} CAD.`,
      "Open /finance/time for normal, missing-checkout, overtime, worker-swap and manual project entries. Two exceptions remain unposted.",
      "Open /finance/rates as Director for the confidential midyear effective rate change. Area Managers cannot read rate payloads.",
    ] : []),
    ...(plan.scenario.modules.reconciliation ? [
      "Open /finance/reconciliation as Director. June has one unique exact repair match, two ambiguous fuel proposals and an unmatched accounting row; it must remain open.",
      "July is closed but stale after a late accepted synthetic import. Reopen with a reason before correction. Area Managers see only assigned-site aggregate status.",
      ...(plan.scenario.generatorVersion >= 7 ? [
        `August is the complete closed two-site comparison. ${plan.expected.reconciliation.showcaseSites.map(row =>
          `${plan.sites.find(site => site.id === row.siteId)?.name}: CAD ${row.recognizedRevenue} recognized revenue and CAD ${row.contribution} direct contribution`).join("; ")}.`,
        "Select August in /finance. Compare source-backed revenue, posted labour and supply/repair expenses, then open the accounting reconciliation and source workspaces. Values are synthetic, not measured Tornado performance.",
      ] : []),
    ] : []),
  ];
  const output = `${lines.join("\n")}\n`;
  await writeFile(join(outputRoot, name, "presenter-tests.md"), output);
  process.stdout.write(output);
}

try {
  const { operation, name, seed, target, projectRef, organizationId } = parseArgs();
  if (operation === "plan") {
    const plan = await loadPlan(name, seed);
    process.stdout.write(`${JSON.stringify({ scenarioId: name, organizationId: plan.organization.id,
      runId: plan.runId, seed: plan.scenario.seed, sites: plan.sites.map(site => ({ id: site.id, name: site.name })),
      expected: plan.expected.controlTotals }, null, 2)}\n`);
  }
  if (target === "hosted") {
    if (name !== "finance-showcase") throw new Error("Only the reviewed finance-showcase pack is allowed on the hosted demo.");
    hostedTarget = { projectRef, organizationId };
    outputRoot = join(root, "fixtures", "generated", "hosted", projectRef);
  }
  if (operation === "preflight") await preflight(name, seed);
  if (operation === "generate" && hostedTarget) await preflight(name, seed);
  if (operation === "generate") await generate(name, seed);
  if (operation === "reset") await reset(name);
  if (operation === "assert") await assertScenario(name);
  if (operation === "presenter") await presenter(name);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Scenario command failed.");
  process.exitCode = 1;
}
