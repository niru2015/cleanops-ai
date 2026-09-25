import { describe, expect, it } from "vitest";
import { parseFinanceCsv } from "@/services/finance-csv";

const site = { id: "10000000-0000-4000-8000-000000000001", name: "Grand Casino" };
const header = "source_document_id,source_line_id,site_reference,service_period,accounting_period,currency,category,amount,approval_state,recognition_state";
const referenceHeader = `${header},operational_reference_type,operational_reference_id`;
const referenceRow = "INV-1,1,Grand Casino,2026-08-01,2026-08-01,CAD,supplies,25.00,approved,actual";

describe("CLEAN-020 neutral finance CSV", () => {
  it("calculates direct contribution from approved actual rows", () => {
    const preview = parseFinanceCsv(`${header}\nINV-1,1,Grand Casino,2026-08-01,2026-08-01,CAD,revenue,350000.00,approved,actual\nINV-2,1,Grand Casino,2026-08-01,2026-08-01,CAD,direct_labour,290000.00,approved,actual`, [site]);
    expect(preview.errors).toEqual([]);
    expect(preview.totals).toEqual({ revenue: 350000, directCost: 290000, directContribution: 60000 });
  });

  it("keeps unknown sites and categories visible but unallocated", () => {
    const preview = parseFinanceCsv(`${header}\nINV-1,1,Unknown,2026-08-01,2026-08-01,CAD,mystery,25.00,approved,actual`, [site]);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ site_id: "", category: "unmapped" });
    expect(preview.warnings).toHaveLength(2);
  });

  it("does not count pending, estimated, overhead or tax as direct contribution", () => {
    const csv = `${header}\nA,1,Grand Casino,2026-08-01,2026-08-01,CAD,revenue,100.00,approved,actual\nB,1,Grand Casino,2026-08-01,2026-08-01,CAD,supplies,20.00,pending,actual\nC,1,Grand Casino,2026-08-01,2026-08-01,CAD,repairs,20.00,approved,estimate\nD,1,Grand Casino,2026-08-01,2026-08-01,CAD,overhead,20.00,approved,actual\nE,1,Grand Casino,2026-08-01,2026-08-01,CAD,tax,20.00,approved,actual`;
    expect(parseFinanceCsv(csv, [site]).totals).toEqual({ revenue: 100, directCost: 0, directContribution: 100 });
  });

  it("supports quoted commas and rejects duplicate source lines", () => {
    const preview = parseFinanceCsv(`${header}\nINV-1,1,"Grand Casino",2026-08-01,2026-08-01,CAD,revenue,10.00,approved,actual\nINV-1,1,"Grand Casino",2026-08-01,2026-08-01,CAD,revenue,10.00,approved,actual`, [site]);
    expect(preview.errors).toContain("Row 3: duplicate source document and line ID.");
  });

  it("rejects an unsupported operational reference type during preview", () => {
    const preview = parseFinanceCsv(`${referenceHeader}\n${referenceRow},labor_cost_entry,10000000-0000-4000-8000-000000000002`, [site]);
    expect(preview.errors).toContain("Row 2: operational reference type 'labor_cost_entry' is unsupported. Use supply_invoice, supply_receipt, repair_invoice or repair_report.");
  });

  it("requires an operational reference type and ID together", () => {
    const typeOnly = parseFinanceCsv(`${referenceHeader}\n${referenceRow},supply_invoice,`, [site]);
    const idOnly = parseFinanceCsv(`${referenceHeader}\n${referenceRow},,10000000-0000-4000-8000-000000000002`, [site]);
    expect(typeOnly.errors).toContain("Row 2: operational reference type and ID must be provided together.");
    expect(idOnly.errors).toContain("Row 2: operational reference type and ID must be provided together.");
  });

  it("requires a UUID reference ID and accepts a supported pair", () => {
    const invalid = parseFinanceCsv(`${referenceHeader}\n${referenceRow},repair_report,not-a-uuid`, [site]);
    const valid = parseFinanceCsv(`${referenceHeader}\n${referenceRow},repair_report,10000000-0000-4000-8000-000000000002`, [site]);
    expect(invalid.errors).toContain("Row 2: operational reference ID must be a UUID.");
    expect(valid.errors).toEqual([]);
    expect(valid.rows[0]).toMatchObject({ operational_reference_type: "repair_report", operational_reference_id: "10000000-0000-4000-8000-000000000002" });
  });
});
