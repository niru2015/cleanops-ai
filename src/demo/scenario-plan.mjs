import { parseScenario, parseReference } from "./scenario-schema.mjs";
import { seededRng, stableUuid } from "./deterministic-rng.mjs";

export function buildScenarioPlan(input, reference) {
  const scenario = parseScenario(input);
  reference = parseReference(reference);
  if (reference.personas.filter((persona) => persona.role === "cleaner").length > scenario.organization.workerCount) throw new Error("Scenario workerCount is smaller than the cleaner persona count.");
  const rng = seededRng(scenario.seed, scenario.scenarioId);
  const id = (path) => stableUuid(scenario.scenarioId, path);
  const runId = id(`run/${scenario.seed}`);
  const organization = { id: id("organization"), name: `${scenario.organization.name} · Synthetic demo`, slug: `scenario-${scenario.scenarioId}` };
  const client = { id: id("client"), organization_id: organization.id, name: `${scenario.organization.name} Demo Client` };
  const sites = Array.from({ length: scenario.organization.siteCount }, (_, index) => ({
    id: id(`site/${index}`), organization_id: organization.id, client_id: client.id,
    name: `${reference.siteNames[index] ?? `Scenario Site ${index + 1}`} · Synthetic demo`,
    city: reference.city ?? "Vancouver", timezone: scenario.clock.timezone,
  }));
  const workers = Array.from({ length: scenario.organization.workerCount }, (_, index) => ({
    id: id(`worker/${index}`), organization_id: organization.id,
    display_name: `${reference.workerNames[index] ?? `Worker ${String(index + 1).padStart(3, "0")}`} · Demo`,
    active: true,
    siteIndex: Math.floor(rng() * sites.length),
  }));
  let cleanerOrdinal = 0;
  const personas = reference.personas.map((persona, index) => {
    const worker = persona.role === "cleaner" ? workers[cleanerOrdinal++] : null;
    return ({
    key: persona.key,
    displayName: persona.displayName,
    role: persona.role,
    email: `${scenario.scenarioId}.${persona.key}@cleanops.example.com`,
    membershipId: id(`membership/${persona.key}`),
    siteIndex: worker?.siteIndex ?? index % sites.length,
    workerId: worker?.id ?? null,
  });
  });
  const workerPermissions = workers.map((worker, index) => ({
    id: id(`worker-permission/${index}`), organization_id: organization.id,
    worker_id: worker.id, site_id: sites[worker.siteIndex].id,
    state: "active", valid_from: `${scenario.clock.start}T00:00:00Z`,
  }));
  const memberGrants = personas.filter((persona) => !["organization_administrator", "operations_manager"].includes(persona.role)).map((persona) => ({
    id: id(`member-grant/${persona.key}`), organization_id: organization.id,
    membership_id: persona.membershipId, site_id: sites[persona.siteIndex].id,
    starts_at: `${scenario.clock.start}T00:00:00Z`,
  }));
  const contract = scenario.modules.contracts ? (() => {
    if (!scenario.clock.start.endsWith("-01")) throw new Error("Contract scenario clock must start on a month boundary.");
    if (!personas.some((persona) => persona.role === "organization_administrator")) throw new Error("Contract scenario requires a Director persona.");
    const addMonths = (date, months) => {
      const value = new Date(`${date}T00:00:00Z`);
      value.setUTCMonth(value.getUTCMonth() + months);
      return value.toISOString().slice(0, 10);
    };
    const baseCents = 150000 + Math.floor(rng() * 50000);
    const amendedCents = Math.round(baseCents * 1.1);
    const amendmentDate = addMonths(scenario.clock.start, 4);
    return {
      zone: { id: id("contract/zone"), organization_id: organization.id, site_id: sites[0].id,
        name: "Synthetic contract service zone" },
      identity: { id: id("contract"), organization_id: organization.id, site_id: sites[0].id,
        client_id: client.id, code: `DEMO-${scenario.scenarioId.toUpperCase()}`, name: "Synthetic recurring cleaning agreement" },
      versions: [0, 1].map((index) => ({
        id: id(`contract/version/${index}`), organization_id: organization.id, site_id: sites[0].id,
        contract_id: id("contract"), version_number: index + 1,
        source_type: index ? "amendment" : "manual",
        effective_from: index ? amendmentDate : scenario.clock.start,
        supply_responsibility: "included", equipment_responsibility: "reimbursable",
        repair_responsibility: "unknown",
      })),
      terms: [baseCents, amendedCents].map((cents, index) => ({
        id: id(`contract/term/${index}`), organization_id: organization.id, site_id: sites[0].id,
        contract_version_id: id(`contract/version/${index}`), basis: "fixed_monthly",
        amount: (cents / 100).toFixed(2), currency: "CAD",
        effective_from: index ? amendmentDate : scenario.clock.start,
      })),
      obligations: [0, 1].map((index) => ({
        id: id(`contract/obligation/${index}`), organization_id: organization.id, site_id: sites[0].id,
        contract_version_id: id(`contract/version/${index}`), zone_id: id("contract/zone"),
        name: "Synthetic quarterly deep clean", recurrence: "quarterly", work_type: "specialist", due_window_minutes: 1440,
        evidence_required: true, inspection_required: true,
      })),
      staffing: [2, 3].map((positions, index) => ({
        id: id(`contract/staffing/${index}`), organization_id: organization.id, site_id: sites[0].id,
        contract_version_id: id(`contract/version/${index}`), weekday: 1,
        local_start: "08:00:00", local_end: "16:00:00", required_positions: positions,
      })),
      expected: { versionCount: 2, currentRevenueEntries: 16,
        expectedRevenue: ((baseCents * 4 + amendedCents * 12) / 100).toFixed(2), currency: "CAD",
        amendmentDate },
    };
  })() : null;
  const expected = {
    schemaVersion: scenario.schemaVersion,
    generatorVersion: scenario.generatorVersion,
    scenarioId: scenario.scenarioId,
    runId,
    seed: scenario.seed,
    clock: scenario.clock,
    organizationId: organization.id,
    entityCounts: { organizations: 1, clients: 1, sites: sites.length, workers: workers.length, workerPermissions: workerPermissions.length, personas: personas.length, memberGrants: memberGrants.length },
    controlTotals: { siteCount: sites.length, workerCount: workers.length,
      finance: contract ? { contracts: 1, expectedRevenue: contract.expected.expectedRevenue,
        currency: contract.expected.currency, currentRevenueEntries: contract.expected.currentRevenueEntries } : null },
    expectedExceptions: [],
    roleSiteAccess: personas.map((persona) => ({ persona: persona.key, role: persona.role, siteIds: persona.role === "organization_administrator" || persona.role === "operations_manager" ? sites.map((site) => site.id) : [sites[persona.siteIndex].id] })),
    reconciliation: { status: "not_implemented", matched: 0, unmatched: 0 },
    stage: contract ? "B/contracts" : "A/base-only",
  };
  if (contract) expected.entityCounts.contracts = 1;
  return { scenario, runId, organization, client, sites, workers, workerPermissions, personas, memberGrants, contract, expected };
}
