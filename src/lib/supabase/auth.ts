import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAuthenticatedClaims() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    throw new Error("Authentication required.");
  }

  return data.claims;
}
