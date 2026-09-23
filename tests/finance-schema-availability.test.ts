import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalFinanceRows } from "@/services/finance-schema-availability";

const schema = z.array(z.object({ amount: z.number() }));

describe("finance panels with a lagging hosted schema", () => {
  it("keeps optional accounting/time sections unavailable when their table is missing", async () => {
    for (const code of ["PGRST205", "42P01"]) {
      const result = await optionalFinanceRows(Promise.resolve({ data: null,
        error: { code, message: "table unavailable" } }), schema);
      expect(result).toEqual({ rows: [], available: false });
    }
  });

  it("does not hide permission errors or malformed financial data", async () => {
    await expect(optionalFinanceRows(Promise.resolve({ data: null,
      error: { code: "42501", message: "access denied" } }), schema)).rejects.toThrow("access denied");
    await expect(optionalFinanceRows(Promise.resolve({ data: [{ amount: "20" }], error: null }), schema))
      .rejects.toThrow("did not match their contract");
  });
});
