import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAppAccessContext } from "@/services/access-context";
import { getFinanceSiteContext } from "@/services/finance-context";

const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
const siteB = "40000000-0000-4000-8000-000000000003";
const actor = "00000000-0000-4000-8000-000000000006";

function clientFor(memberships: unknown[]) {
  const filters: Record<string, string>[] = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: actor } }, error: null }) },
    from(table: string) {
      const filter: Record<string, string> = { table };
      filters.push(filter);
      const query = {
        select() { return query; },
        eq(key: string, value: string) { filter[key] = value; return query; },
        limit: async () => ({ data: memberships, error: null }),
        order: async () => ({ data: [{ id: siteB, name: "Northstar Harbour Demo", city: "Richmond" }], error: null }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, filters };
}

describe("trusted finance scope", () => {
  it("derives a second organization's site from its sole active membership", async () => {
    const { client, filters } = clientFor([{ id: "20000000-0000-4000-8000-000000000006", organization_id: orgB, role: "organization_administrator" }]);
    const access = await getAppAccessContext(client);
    expect(access.organizationId).toBe(orgB);
    expect(filters[0]).toMatchObject({ table: "memberships", user_id: actor, state: "active" });
    expect(filters[0]).not.toHaveProperty("organization_id");
    expect(filters[1]).toMatchObject({ table: "sites", organization_id: orgB });
    expect(getFinanceSiteContext(access, siteB)).toMatchObject({ organizationId: orgB, siteId: siteB, canReadLabour: true });
    expect(() => getFinanceSiteContext(access, "40000000-0000-4000-8000-000000000001")).toThrow();
  });

  it("fails closed when more than one active organization is visible", async () => {
    const memberships = [orgA, orgB].map((organization_id, i) => ({ id: `20000000-0000-4000-8000-00000000000${i + 1}`, organization_id, role: "organization_administrator" }));
    await expect(getAppAccessContext(clientFor(memberships).client)).rejects.toThrow("Organization selection required.");
  });

  it("rejects a user without an active membership", async () => {
    await expect(getAppAccessContext(clientFor([]).client)).rejects.toThrow("Active CleanOps membership required.");
  });

  it("keeps demo tenant constants out of generic access and finance paths", () => {
    const paths = [
      "src/services/access-context.ts", "src/services/finance-context.ts",
      "src/integrations/finance/supabase-finance.ts", "src/integrations/messages/supabase-message-context.ts",
      "src/app/finance/actions.ts", "src/app/finance/page.tsx",
    ];
    for (const path of paths) {
      expect(readFileSync(join(process.cwd(), path), "utf8"), path).not.toMatch(/\b(?:DEMO_ORGANIZATION_ID|DEMO_SITE_ID|HOSTED_DEMO_ORGANIZATION_ID)\b/);
    }
  });
});
