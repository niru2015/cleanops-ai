import { describe, expect, it } from "vitest";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

describe("Supabase public configuration", () => {
  it("accepts a project URL and publishable key", () => {
    expect(
      getPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_demo",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toEqual({
      publishableKey: "sb_publishable_local_demo",
      url: "http://127.0.0.1:54321",
    });
  });

  it("rejects missing or malformed values", () => {
    expect(() => getPublicSupabaseConfig({})).toThrow("Supabase is not configured");
    expect(() =>
      getPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key",
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow("Supabase is not configured");
  });
});
