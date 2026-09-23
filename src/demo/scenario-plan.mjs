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
  const expenseCases = scenario.modules.expenses ? (() => {
    if (!personas.some((persona) => persona.role === "organization_administrator") ||
      !personas.some((persona) => persona.role === "cleaner"))
      throw new Error("Expense scenario requires Director and Cleaner personas.");
    const base = [
      ["fuel", "fuel_travel", "Demo Fuel", 4200, "employee_personal", 0, "whatsapp"],
      ["meal", "meals", "Demo Cafe", 1825, "company_card", 0, "app"],
      ["supply", "supplies", "Demo Supply", 6530, "supplier_invoice", 1 % sites.length, "app"],
      ["repair", "equipment_repair", "Demo Repair", 12000, "company_card", 1 % sites.length, "app"],
      ["equipment", "equipment_purchase", "Demo Equipment", 29900, "company_card", 0, "app"],
    ];
    const cases = base.map(([key, category, vendor, baseCents, paymentMethod, siteIndex, sourceKind]) => {
      const cents = baseCents + Math.floor(rng() * 300);
      const appPersona=sourceKind === "app" ? personas.find(persona =>
        ["cleaner","area_manager"].includes(persona.role) && persona.siteIndex === siteIndex)
        ?? personas.find(persona => persona.role === "cleaner") : null;
      return { key, category, vendor, cents, paymentMethod,
        siteIndex: appPersona?.siteIndex ?? siteIndex, sourceKind,
        date: scenario.clock.start, projectReference: scenario.modules.projects && key === "fuel" ? "HASTINGS-DEEP-CLEAN" : key === "fuel" ? "Synthetic one-off job" : null,
        file: `${key}-receipt.png`, approved: true };
    });
    cases.push({ ...cases[0], key: "duplicate-fuel", file: cases[0].file,
      sourceKind: "whatsapp", approved: false });
    if (scenario.modules.projects) cases.push({ key: "project-supply", category: "supplies",
      vendor: "Demo Project Supplies", cents: 3200 + Math.floor(rng() * 300),
      paymentMethod: "supplier_invoice", siteIndex: 0, sourceKind: "app",
      date: scenario.clock.start, projectReference: "HASTINGS-DEEP-CLEAN",
      file: "project-supply-receipt.png", approved: true });
    return cases;
  })() : null;
  const expenseCents = expenseCases?.filter((item) => item.approved).reduce((sum,item) => sum+item.cents,0) ?? 0;
  const timeCases = scenario.modules.time ? (() => {
    const siteWorkers = workers.filter(worker => worker.siteIndex === 0);
    if (siteWorkers.length < 2 || !personas.some(persona => persona.role === "organization_administrator"))
      throw new Error("Time scenario requires two site-zero workers and a Director persona.");
    const [primary, replacement] = siteWorkers;
    const make = (key, worker, date, startHour, endHour, status, costType = "regular") => ({
      key, workerId: worker.id, siteId: sites[0].id, shiftId: id(`time/${key}/shift`),
      assignmentId: id(`time/${key}/assignment`), date, start: `${date}T${startHour}:00:00Z`,
      end: endHour ? `${date}T${endHour}:00:00Z` : null, status, costType,
    });
    const swapOriginal = make("worker_swap_original", primary, "2026-06-13", "08", null, "exception");
    return [
      { ...make("normal_shift", primary, "2026-06-01", "08", "16", "posted"),
        shiftId: null, start: null, end: null, hours: 8, useContractShift: true },
      make("missing_checkout", primary, "2026-06-11", "08", null, "exception"),
      make("overtime", primary, "2026-06-12", "08", "17", "posted", "overtime"),
      swapOriginal,
      { ...make("worker_swap_replacement", replacement, "2026-06-13", "08", "16", "posted"),
        shiftId: swapOriginal.shiftId, reuseShift: true },
      { key: "manual_project", workerId: primary.id, siteId: sites[0].id,
        date: "2026-09-15", status: "posted", costType: "regular",
        projectReference: scenario.modules.projects ? "HASTINGS-DEEP-CLEAN" : "Synthetic Hastings deep clean", hours: 3 },
    ];
  })() : null;
  const labourCents = timeCases?.filter(item => item.status === "posted").reduce((sum, item) => {
    const hours = item.hours ?? (new Date(item.end) - new Date(item.start)) / 3600000;
    const rate = item.costType === "overtime" ? 36 : item.date >= "2026-08-01" ? 27 : 24;
    return sum + Math.round(hours * rate * 100);
  }, 0) ?? 0;
  const projects = scenario.modules.projects ? [
    { id: id("project/hastings"), code: "HASTINGS-DEEP-CLEAN", name: "Synthetic Hastings deep clean",
      scope: "Synthetic one-off deep clean with approved time, fuel and supplies.", quote: 120000 + Math.floor(rng() * 5000), recognized: 80000 + Math.floor(rng() * 3000), complete: true },
    { id: id("project/incomplete"), code: "HASTINGS-REPAIR-PENDING", name: "Synthetic Hastings follow-up",
      scope: "Synthetic follow-up project awaiting invoices and accounting close.", quote: 45000 + Math.floor(rng() * 3000), recognized: 0, complete: false },
  ] : null;
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
      finance: contract || expenseCases ? { contracts: contract ? 1 : 0,
        expectedRevenue: contract?.expected.expectedRevenue ?? "0.00",
        currency: "CAD", currentRevenueEntries: contract?.expected.currentRevenueEntries ?? 0,
        approvedExpenseCost: (expenseCents/100).toFixed(2),
        approvedLabourCost: (labourCents/100).toFixed(2),
        expenseByCategory: Object.fromEntries((expenseCases??[]).filter(item=>item.approved)
          .map(item=>[item.category,(item.cents/100).toFixed(2)])) } : null },
    expectedExceptions: [...(expenseCases ? ["duplicate_whatsapp_receipt"] : []),
      ...(timeCases ? ["missing_checkout", "worker_swap"] : [])],
    roleSiteAccess: personas.map((persona) => ({ persona: persona.key, role: persona.role, siteIds: persona.role === "organization_administrator" || persona.role === "operations_manager" ? sites.map((site) => site.id) : [sites[persona.siteIndex].id] })),
    reconciliation: { status: "not_implemented", matched: 0, unmatched: 0 },
    stage: projects ? "B/contracts+expenses+time+projects" : timeCases ? "B/contracts+expenses+time" : expenseCases ? "B/contracts+expenses" : contract ? "B/contracts" : "A/base-only",
  };
  if (projects) {
    const projectExpenses = expenseCases.filter(item => item.approved && item.projectReference === projects[0].code);
    const directCost = 3 * 27 * 100 + projectExpenses.reduce((sum,item) => sum + item.cents,0);
    expected.projects = projects.map(item => ({ code: item.code, quote: (item.quote/100).toFixed(2),
      recognized: (item.recognized/100).toFixed(2), directCost: item.complete ? (directCost/100).toFixed(2) : "0.00",
      contribution: item.complete ? ((item.recognized-directCost)/100).toFixed(2) : null,
      completeness: item.complete ? "complete" : "incomplete" }));
  }
  if (contract) expected.entityCounts.contracts = 1;
  if (expenseCases) expected.entityCounts.expenseCandidates=expenseCases.length;
  if (timeCases) expected.entityCounts.timeEntries=timeCases.length;
  return { scenario, runId, organization, client, sites, workers, workerPermissions, memberGrants,
    personas, contract, expenseCases, timeCases, projects, expected };
}
