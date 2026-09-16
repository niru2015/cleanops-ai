import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const privilegedConfigSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

export function getPrivilegedSupabaseConfig(
  environment: Record<string, string | undefined> = process.env,
) {
  const result = privilegedConfigSchema.safeParse(environment);
  if (!result.success) {
    throw new Error("Privileged Supabase access is not configured.");
  }

  return {
    url: result.data.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: result.data.SUPABASE_SECRET_KEY,
  };
}

export function createPrivilegedSupabaseClient() {
  const config = getPrivilegedSupabaseConfig();

  return createClient(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
