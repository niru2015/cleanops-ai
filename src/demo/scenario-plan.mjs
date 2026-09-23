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
  const expected = {
    schemaVersion: scenario.schemaVersion,
    generatorVersion: scenario.generatorVersion,
    scenarioId: scenario.scenarioId,
    runId,
    seed: scenario.seed,
    clock: scenario.clock,
    organizationId: organization.id,
    entityCounts: { organizations: 1, clients: 1, sites: sites.length, workers: workers.length, workerPermissions: workerPermissions.length, personas: personas.length, memberGrants: memberGrants.length },
    controlTotals: { siteCount: sites.length, workerCount: workers.length, finance: null },
    expectedExceptions: [],
    roleSiteAccess: personas.map((persona) => ({ persona: persona.key, role: persona.role, siteIds: persona.role === "organization_administrator" || persona.role === "operations_manager" ? sites.map((site) => site.id) : [sites[persona.siteIndex].id] })),
    reconciliation: { status: "not_implemented", matched: 0, unmatched: 0 },
    stage: "A/base-only",
  };
  return { scenario, runId, organization, client, sites, workers, workerPermissions, personas, memberGrants, expected };
}
