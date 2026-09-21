import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { hasHostedDemoAccess, isHostedDemoEnabled } from "@/services/hosted-demo";

const originalHostedDemo = process.env.CLEANOPS_HOSTED_DEMO_ENABLED;

afterEach(() => {
  if (originalHostedDemo === undefined) delete process.env.CLEANOPS_HOSTED_DEMO_ENABLED;
  else process.env.CLEANOPS_HOSTED_DEMO_ENABLED = originalHostedDemo;
});

function clientWith(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        lte() { return builder; },
        or() { return builder; },
        limit() { return builder; },
        async maybeSingle() { return { data: rows[table] ?? null, error: null }; },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("hosted synthetic demo access", () => {
  it("is disabled unless the server flag is explicitly true", () => {
    expect(isHostedDemoEnabled({})).toBe(false);
    expect(isHostedDemoEnabled({ CLEANOPS_HOSTED_DEMO_ENABLED: "false" })).toBe(false);
    expect(isHostedDemoEnabled({ CLEANOPS_HOSTED_DEMO_ENABLED: "true" })).toBe(true);
  });

  it("allows a site-granted supervisor only for supervisor capability", async () => {
    process.env.CLEANOPS_HOSTED_DEMO_ENABLED = "true";
    const client = clientWith({
      memberships: { id: "20000000-0000-4000-8000-000000000002", role: "site_supervisor" },
      member_site_access: { id: "41000000-0000-4000-8000-000000000001" },
    });

    await expect(hasHostedDemoAccess(client, "10000000-0000-4000-8000-000000000010", "supervisor")).resolves.toBe(true);
    await expect(hasHostedDemoAccess(client, "10000000-0000-4000-8000-000000000010", "cleaner")).resolves.toBe(false);
  });

  it("requires both the cleaner role and mapped active worker", async () => {
    process.env.CLEANOPS_HOSTED_DEMO_ENABLED = "true";
    const allowed = clientWith({
      memberships: { id: "20000000-0000-4000-8000-000000000004", role: "cleaner" },
      member_site_access: { id: "41000000-0000-4000-8000-000000000003" },
      workers: { id: "60000000-0000-4000-8000-000000000001" },
    });
    const denied = clientWith({
      memberships: { id: "20000000-0000-4000-8000-000000000004", role: "cleaner" },
      member_site_access: { id: "41000000-0000-4000-8000-000000000003" },
    });

    await expect(hasHostedDemoAccess(allowed, "10000000-0000-4000-8000-000000000011", "cleaner")).resolves.toBe(true);
    await expect(hasHostedDemoAccess(denied, "10000000-0000-4000-8000-000000000011", "cleaner")).resolves.toBe(false);
  });
});
