import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AppAccessContext } from "@/services/access-context";
import { summarizeSite, type SiteFinanceSummary } from "@/services/finance-summary";

const expectation = z.object({ site_id: z.uuid(), service_period: z.string(), amount: z.coerce.number(), currency: z.string() });
const actual = z.object({ site_id: z.uuid(), service_period: z.string(), currency: z.string(),
  recognized_revenue: z.coerce.number(), direct_labour: z.coerce.number(), supplies: z.coerce.number(),
  repairs: z.coerce.number(), other_direct_cost: z.coerce.number(), completeness: z.string() });
const periodSite = z.object({ site_id: z.uuid(), period_start: z.string(), currency: z.string(),
  state: z.string(), coverage: z.string(), unmatched_amount: z.coerce.number(),
  unallocated_source_amount: z.coerce.number(), stale: z.boolean() });
const intake = z.object({ site_id: z.uuid().nullable(), review_state: z.string() });

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T[]> {
  const output: T[] = [];
  for (let from = 0; from < 10_000; from += 500) {
    const result = await query(from, from + 499);
    if (result.error) throw new Error(result.error.message);
    const page = z.array(schema).parse(result.data);
    output.push(...page);
    if (page.length < 500) return output;
  }
  throw new Error("Finance summary exceeded its review limit.");
}

export async function getFinanceSummary(client: SupabaseClient, access: AppAccessContext, month: string): Promise<SiteFinanceSummary[]> {
  if (!access.canViewFinance) throw new Error("Finance access required.");
  const siteIds = access.sites.map(site => site.id);
  if (!siteIds.length) return [];
  const [expectations, actuals, periods, intakes] = await Promise.all([
    all((from, to) => client.from("contract_revenue_expectations")
      .select("site_id,service_period,amount,currency").eq("organization_id", access.organizationId)
      .in("site_id", siteIds).eq("service_period", `${month}-01`).eq("is_current", true).range(from, to), expectation),
    all((from, to) => client.from("finance_reconciliations")
      .select("site_id,service_period,currency,recognized_revenue,direct_labour,supplies,repairs,other_direct_cost,completeness")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .eq("service_period", `${month}-01`).eq("is_current", true).range(from, to), actual),
    all((from, to) => client.rpc("list_finance_period_site_status").range(from, to), periodSite),
    all((from, to) => client.from("finance_intake_items").select("site_id,review_state")
      .eq("organization_id", access.organizationId).in("site_id", siteIds).range(from, to), intake),
  ]);
  return access.sites.map(site => {
    const expected = expectations.filter(row => row.site_id === site.id);
    const siteActuals = actuals.filter(row => row.site_id === site.id);
    const currencies = new Set([...expected.map(row => row.currency), ...siteActuals.map(row => row.currency)]);
    const mismatch = currencies.size > 1 || siteActuals.length > 1;
    const currency = currencies.values().next().value ?? "CAD";
    const actualRow = !mismatch ? siteActuals[0] : undefined;
    const period = periods.find(row => row.site_id === site.id && row.period_start === `${month}-01` && row.currency === currency);
    return summarizeSite({ siteId: site.id, siteName: site.name, period: month, currency,
      expectedRevenue: expected.length && !mismatch ? expected.reduce((sum, row) => sum + row.amount, 0) : null,
      recognizedRevenue: actualRow?.recognized_revenue ?? null,
      labour: actualRow?.direct_labour ?? null, supplies: actualRow?.supplies ?? null,
      repairs: actualRow?.repairs ?? null, otherDirectCost: actualRow?.other_direct_cost ?? null,
      completeness: mismatch ? "currency mismatch" : actualRow?.completeness ?? "no accepted import",
      periodState: period?.state ?? null, stale: period?.stale ?? false,
      unmatchedAmount: period?.unmatched_amount ?? null,
      pendingExpenseCount: intakes.filter(row => row.site_id === site.id && !["posted", "rejected"].includes(row.review_state)).length,
    });
  });
}
