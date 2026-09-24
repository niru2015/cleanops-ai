export type Money = { amount: number; currency: string };

export type SiteFinanceSummary = {
  siteId: string;
  siteName: string;
  period: string;
  currency: string;
  expectedRevenue: number | null;
  recognizedRevenue: number | null;
  labour: number | null;
  supplies: number | null;
  repairs: number | null;
  otherDirectCost: number | null;
  contribution: number | null;
  margin: number | null;
  completeness: string;
  periodState: string | null;
  stale: boolean;
  unmatchedAmount: number | null;
  pendingExpenseCount: number;
  flags: { code: string; label: string; detail: string; href: string }[];
};

export function summarizeSite(input: Omit<SiteFinanceSummary, "contribution" | "margin" | "flags">): SiteFinanceSummary {
  const complete = input.completeness === "complete" && input.periodState === "closed" && !input.stale;
  const costs = [input.labour, input.supplies, input.repairs, input.otherDirectCost];
  const contribution = complete && input.recognizedRevenue !== null && costs.every(value => value !== null)
    ? Math.round((input.recognizedRevenue - costs.reduce<number>((sum, value) => sum + (value ?? 0), 0)) * 100) / 100
    : null;
  const flags: SiteFinanceSummary["flags"] = [];
  if (input.stale) flags.push({ code: "stale-close-v1", label: "Closed period needs review", detail: "Accepted sources changed after close.", href: "/finance/reconciliation" });
  if (input.unmatchedAmount !== null && input.unmatchedAmount > 0) flags.push({ code: "unmatched-cost-v1", label: "Unmatched operational cost", detail: `${input.currency} ${input.unmatchedAmount.toFixed(2)} requires reconciliation.`, href: "/finance/reconciliation" });
  if (input.pendingExpenseCount > 0) flags.push({ code: "pending-intake-v1", label: "Finance intake needs review", detail: `${input.pendingExpenseCount} candidate(s) await resolution.`, href: "/finance/inbox" });
  if (input.expectedRevenue !== null && input.recognizedRevenue !== null && input.expectedRevenue > 0 &&
    Math.abs(input.expectedRevenue - input.recognizedRevenue) >= Math.max(100, input.expectedRevenue * 0.1))
    flags.push({ code: "revenue-variance-v1", label: "Expected and recognized revenue differ", detail: `Expected ${input.currency} ${input.expectedRevenue.toFixed(2)}; recognized ${input.currency} ${input.recognizedRevenue.toFixed(2)}. Check contract and accounting sources.`, href: "/finance/contracts" });
  return { ...input, flags, contribution, margin: contribution !== null && input.recognizedRevenue !== null && input.recognizedRevenue > 0
    ? contribution / input.recognizedRevenue : null };
}

export function combineSites(sites: SiteFinanceSummary[]) {
  const currency = sites[0]?.currency ?? null;
  const compatible = !!currency && sites.every(site => site.currency === currency);
  const complete = compatible && sites.every(site => site.contribution !== null);
  const recognizedRevenue = complete ? sites.reduce((sum, site) => sum + (site.recognizedRevenue ?? 0), 0) : null;
  const contribution = complete ? sites.reduce((sum, site) => sum + (site.contribution ?? 0), 0) : null;
  return { currency: compatible ? currency : null, recognizedRevenue, contribution,
    margin: recognizedRevenue && contribution !== null ? contribution / recognizedRevenue : null };
}
