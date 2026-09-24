import { describe, expect, it } from "vitest";
import { combineSites, summarizeSite } from "../src/services/finance-summary";

const base = {
  siteId: "site-1", siteName: "Synthetic site", period: "2026-07", currency: "CAD",
  expectedRevenue: 1200, recognizedRevenue: 1000, labour: 300, supplies: 100,
  repairs: 50, otherDirectCost: 50, completeness: "complete", periodState: "closed",
  stale: false, unmatchedAmount: 0, pendingExpenseCount: 0,
};

describe("finance summary", () => {
  it("computes source-backed contribution after complete close", () => {
    const site = summarizeSite(base);
    expect(site.contribution).toBe(500);
    expect(site.margin).toBe(0.5);
    expect(site.flags.map(flag => flag.code)).toContain("revenue-variance-v1");
  });

  it("withholds contribution for incomplete, stale, or missing revenue", () => {
    for (const change of [{ completeness: "incomplete" }, { stale: true }, { recognizedRevenue: null }, { periodState: "open" }]) {
      expect(summarizeSite({ ...base, ...change }).contribution).toBeNull();
    }
  });

  it("aggregates numerators before computing multi-site margin", () => {
    const combined = combineSites([summarizeSite(base), summarizeSite({ ...base, siteId: "site-2", recognizedRevenue: 500, labour: 100, supplies: 50, repairs: 0, otherDirectCost: 0 })]);
    expect(combined.recognizedRevenue).toBe(1500);
    expect(combined.contribution).toBe(850);
    expect(combined.margin).toBeCloseTo(850 / 1500);
  });

  it("does not combine incomplete or mixed-currency sites", () => {
    expect(combineSites([summarizeSite(base), summarizeSite({ ...base, siteId: "site-2", currency: "USD" })]).contribution).toBeNull();
    expect(combineSites([summarizeSite(base), summarizeSite({ ...base, siteId: "site-2", stale: true })]).contribution).toBeNull();
  });
});
