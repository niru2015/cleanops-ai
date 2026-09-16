import { z } from "zod";

const publicSupabaseConfigSchema = z.object({
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
});

export type PublicSupabaseConfig = {
  publishableKey: string;
  url: string;
};

export function getPublicSupabaseConfig(
  environment: Record<string, string | undefined> = process.env,
): PublicSupabaseConfig {
  const parsed = publicSupabaseConfigSchema.safeParse(environment);

  if (!parsed.success) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return {
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
  };
}
