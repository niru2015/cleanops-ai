"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export function createSupabaseBrowserClient() {
  const config = getPublicSupabaseConfig();
  return createBrowserClient(config.url, config.publishableKey);
}
