import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScenarioPlan } from "../src/demo/scenario-plan.mjs";
import { stableUuid } from "../src/demo/deterministic-rng.mjs";

const scenario = JSON.parse(readFileSync("fixtures/scenarios/stage-a-smoke/scenario.json", "utf8"));
const reference = JSON.parse(readFileSync("fixtures/reference/fictional-v1.json", "utf8"));

describe("CLEAN-015 Stage A scenario plan", () => {
  it("is byte-equivalent for the same version and seed", () => {
    expect(JSON.stringify(buildScenarioPlan(scenario, reference))).toBe(JSON.stringify(buildScenarioPlan(scenario, reference)));
    expect(stableUuid("stage-a-smoke", "site/0")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("changes generated assignment facts with a different seed but keeps identity stable", () => {
    const first = buildScenarioPlan(scenario, reference);
    const second = buildScenarioPlan({ ...scenario, seed: scenario.seed + 1 }, reference);
    expect(first.runId).not.toBe(second.runId);
    expect(first.sites.map((site) => site.id)).toEqual(second.sites.map((site) => site.id));
    expect(first.workers.map((worker) => worker.siteIndex)).not.toEqual(second.workers.map((worker) => worker.siteIndex));
  });

  it("rejects invalid or not-yet-implemented modules before generation", () => {
    expect(() => buildScenarioPlan({ ...scenario, organization: { ...scenario.organization, siteCount: 0 } }, reference)).toThrow("Invalid scenario");
    expect(() => buildScenarioPlan({ ...scenario, modules: { base: true, contracts: true } }, reference)).toThrow("contracts require generatorVersion 2");
    expect(() => buildScenarioPlan({ ...scenario, modules: { base: true, expenses: true } }, reference)).toThrow("expenses require generatorVersion 3");
    expect(() => buildScenarioPlan({ ...scenario, modules: { base: true, time: true } }, reference)).toThrow("time requires generatorVersion 4");
    expect(() => buildScenarioPlan({ ...scenario, modules: { base: true, projects: true } }, reference)).toThrow("projects require generatorVersion 5 with time and expenses");
    expect(() => buildScenarioPlan(scenario, { ...reference, personas: [reference.personas[0], reference.personas[0]] })).toThrow("Invalid reference pack");
  });

  it("keeps role grants inside generated sites and computes only source-backed control counts", () => {
    const plan = buildScenarioPlan(scenario, reference);
    const sites = new Set(plan.sites.map((site) => site.id));
    expect(plan.memberGrants.every((grant) => sites.has(grant.site_id))).toBe(true);
    expect(plan.expected.controlTotals).toEqual({ siteCount: 2, workerCount: 4, finance: null });
  });
});

describe("CLEAN-036 time scenario contribution", () => {
  const timeScenario = JSON.parse(readFileSync("fixtures/scenarios/finance-showcase/scenario.json", "utf8"));
  const timeReference = JSON.parse(readFileSync("fixtures/reference/tornado-v1.json", "utf8"));
  it("defines repeatable time exceptions and a source-backed labour total", () => {
    const plan = buildScenarioPlan(timeScenario, timeReference);
    expect(plan.timeCases.map(item => item.key)).toEqual([
      "normal_shift", "missing_checkout", "overtime", "worker_swap_original",
      "worker_swap_replacement", "manual_project",
    ]);
    expect(plan.expected.controlTotals.finance.approvedLabourCost).toBe("789.00");
    expect(JSON.stringify(plan)).toBe(JSON.stringify(buildScenarioPlan(timeScenario, timeReference)));
  });
});

describe("CLEAN-022 contract scenario contribution", () => {
  const contractScenario = JSON.parse(readFileSync("fixtures/scenarios/contract-smoke/scenario.json", "utf8"));
  it("derives versioned source rows and expected revenue from the seed", () => {
    const first = buildScenarioPlan(contractScenario, reference);
    const repeated = buildScenarioPlan(contractScenario, reference);
    const anotherSeed = buildScenarioPlan({ ...contractScenario, seed: contractScenario.seed + 1 }, reference);
    expect(JSON.stringify(first)).toBe(JSON.stringify(repeated));
    expect(first.contract.identity.id).toBe(anotherSeed.contract.identity.id);
    expect(first.contract.terms[0].amount).not.toBe(anotherSeed.contract.terms[0].amount);
    expect(first.expected.controlTotals.finance.expectedRevenue).not.toBe(anotherSeed.expected.controlTotals.finance.expectedRevenue);
    expect(first.contract.versions.map((version) => version.source_type)).toEqual(["manual", "amendment"]);
  });
});
