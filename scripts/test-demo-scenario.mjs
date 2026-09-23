import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildScenarioPlan } from "../src/demo/scenario-plan.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
const contractSource = JSON.parse(await readFile("fixtures/scenarios/contract-smoke/scenario.json", "utf8"));
const contractPlan = buildScenarioPlan(contractSource, reference);
const registryPath = `fixtures/generated/${scenarioName}/registry.json`;
const seededOrganizations = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];

async function count(table, organizationId) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (error) throw error;
  return count;
}
function assert(value, message) { if (!value) throw new Error(message); }

let created = false;
let contractCreated = false;
let financeCreated = false;
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
  run("generate", "contract-smoke");
  contractCreated = true;
  run("assert", "contract-smoke");
  const contractExpected = JSON.parse(await readFile("fixtures/generated/contract-smoke/expected.json", "utf8"));
  assert(contractExpected.controlTotals.finance.currentRevenueEntries === 16,
    "Contract manifest lost its amendment reconciliation control.");
  const documents = JSON.parse(await readFile("fixtures/generated/contract-smoke/contract-documents.json", "utf8"));
  assert(documents.expected.source.amount === contractPlan.contract.terms[0].amount,
    "Synthetic source amount differs from the contract plan.");
  assert(documents.expected.amendment.amount === contractPlan.contract.terms[1].amount,
    "Synthetic amendment amount differs from the contract plan.");
  assert(documents.expected.ambiguous === "Payment terms: TBD;", "Ambiguous source clause is missing.");
  for (const [file, amount] of [["contract-source.pdf", contractPlan.contract.terms[0].amount],
    ["contract-amendment.pdf", contractPlan.contract.terms[1].amount]]) {
    const loading = getDocument({ data: new Uint8Array(await readFile(`fixtures/generated/contract-smoke/${file}`)) });
    const document = await loading.promise;
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    assert(content.items.map((item) => item.str ?? "").join(" ").includes(`Monthly fee: CAD ${amount}`),
      `${file} does not contain its expected amount.`);
    await loading.destroy();
  }
  const revenue = await client.from("contract_revenue_expectations").select("id")
    .eq("organization_id", contractPlan.organization.id).limit(1).single();
  if (revenue.error) throw revenue.error;
  const missingRevenue = await client.from("contract_revenue_expectations").delete()
    .eq("id", revenue.data.id).eq("organization_id", contractPlan.organization.id);
  if (missingRevenue.error) throw missingRevenue.error;
  let contractAssertionFailed = false;
  try { run("assert", "contract-smoke"); } catch { contractAssertionFailed = true; }
  assert(contractAssertionFailed, "Scenario assertion did not catch missing contract revenue.");
  run("reset", "contract-smoke");
  contractCreated = false;
  run("generate", "contract-smoke");
  contractCreated = true;
  run("assert", "contract-smoke");
  run("reset", "contract-smoke");
  contractCreated = false;
  run("generate", "finance-showcase");
  financeCreated = true;
  run("assert", "finance-showcase");
  const financeExpected = JSON.parse(await readFile("fixtures/generated/finance-showcase/expected.json", "utf8"));
  const financeReceipts = JSON.parse(await readFile("fixtures/generated/finance-showcase/expense-receipts.json", "utf8"));
  const financeSource = JSON.parse(await readFile("fixtures/scenarios/finance-showcase/scenario.json", "utf8"));
  const financeReference = JSON.parse(await readFile("fixtures/reference/tornado-v1.json", "utf8"));
  const financePlan = buildScenarioPlan(financeSource, financeReference);
  const posted = await client.from("expense_postings").select("amount,category")
    .eq("organization_id", financePlan.organization.id);
  if (posted.error) throw posted.error;
  const cents = posted.data.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  assert((cents / 100).toFixed(2) === financeExpected.controlTotals.finance.approvedExpenseCost,
    "Expense postings do not reconcile to generated source costs.");
  assert(posted.data.length === financePlan.expenseCases.filter(item => item.approved).length,
    "Duplicate WhatsApp receipt created an extra cost.");
  assert(financeReceipts.cases.find((item) => item.key === "duplicate-fuel")?.file === "fuel-receipt.png",
    "Duplicate case must reuse exact receipt bytes.");
  const timePack = JSON.parse(await readFile("fixtures/generated/finance-showcase/time-cases.json", "utf8"));
  assert(timePack.approvedLabourCost === financeExpected.controlTotals.finance.approvedLabourCost,
    "Time case source pack lost its labour cost total.");
  const labour = await client.from("labor_cost_entries").select("total_cost")
    .eq("organization_id", financePlan.organization.id);
  if (labour.error) throw labour.error;
  assert((labour.data.reduce((sum, row) => sum + Math.round(Number(row.total_cost) * 100), 0) / 100).toFixed(2)
    === financeExpected.controlTotals.finance.approvedLabourCost,
  "Approved time postings do not reconcile to generated source hours and rates.");
  assert(labour.data.length === 4, "Time exceptions created an unapproved labour cost.");
  const director = financePlan.personas.find(persona => persona.role === "organization_administrator");
  assert(director && financePlan.projects?.length === 2, "Project scenario lost its Director or project plan.");
  const projectRows = await client.from("projects").select("id,project_code,state")
    .eq("organization_id",financePlan.organization.id);
  if (projectRows.error) throw projectRows.error;
  assert(projectRows.data.length === 2 && projectRows.data.some(row => row.state === "completed"),
    "Synthetic project completion did not persist.");
  run("reset", "finance-showcase");
  financeCreated = false;
  assert(await count("sites", financePlan.organization.id) === 0,
    "Finance scenario tenant remained after reset.");
  console.log("Scenario CLI integration passed: base, contracts, expenses, time, projects, source totals, reset and tenant isolation.");
} finally {
  if (created) {
    try { run("reset", scenarioName); } catch { console.error(`Manual cleanup may be needed: npm run demo:reset -- ${scenarioName}`); }
  }
  if (contractCreated) {
    try { run("reset", "contract-smoke"); } catch { console.error("Manual cleanup may be needed: npm run demo:reset -- contract-smoke"); }
  }
  if (financeCreated) {
    try { run("reset", "finance-showcase"); } catch { console.error("Manual cleanup may be needed: npm run demo:reset -- finance-showcase"); }
  }
}
