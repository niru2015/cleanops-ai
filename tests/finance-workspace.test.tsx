import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinanceWorkspace } from "@/components/finance-workspace";
import type { FinanceWorkspace as FinanceWorkspaceData } from "@/integrations/finance/supabase-finance";

const baseWorkspace: FinanceWorkspaceData = {
  vendors: [],
  items: [],
  workers: [],
  tasks: [],
  inventory: [],
  labour: [],
  labourRestricted: false,
  reconciliations: [],
  imports: [],
};

describe("CLEAN-032 labour ledger restricted vs empty", () => {
  it("tells an Area Manager the labour ledger is restricted, not empty", () => {
    const html = renderToStaticMarkup(
      <FinanceWorkspace workspace={{ ...baseWorkspace, labourRestricted: true }} editable={false} siteId="40000000-0000-4000-8000-000000000001" />,
    );

    expect(html).toContain("Individual labour entries are restricted to Directors");
    expect(html).not.toContain("No labour cost entries have been recorded.");
  });

  it("still shows a genuine empty state to a Director", () => {
    const html = renderToStaticMarkup(
      <FinanceWorkspace workspace={{ ...baseWorkspace, labourRestricted: false }} editable siteId="40000000-0000-4000-8000-000000000001" />,
    );

    expect(html).toContain("No labour cost entries have been recorded.");
    expect(html).not.toContain("Individual labour entries are restricted to Directors");
  });

  it("shows a Director's actual labour rows", () => {
    const html = renderToStaticMarkup(
      <FinanceWorkspace
        workspace={{
          ...baseWorkspace,
          labour: [{ id: "60000000-0000-4000-8000-000000000001", workDate: "2026-09-21", worker: "Worker 182 Demo", workerId: null, taskRunId: null, hours: 2, hourlyCost: 24.5, totalCost: 49, type: "regular", notes: null }],
        }}
        editable
        siteId="40000000-0000-4000-8000-000000000001"
      />,
    );

    expect(html).toContain("Worker 182 Demo");
    expect(html).not.toContain("Individual labour entries are restricted to Directors");
    expect(html).not.toContain("No labour cost entries have been recorded.");
  });
});
