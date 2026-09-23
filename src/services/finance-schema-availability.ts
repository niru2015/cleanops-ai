import { z } from "zod";

/** Preserve available finance panels while a later optional module is not migrated yet. */
export async function optionalFinanceRows<T>(
  promise: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
  schema: z.ZodType<T>,
): Promise<{ rows: T; available: boolean }> {
  const result = await promise;
  if (result.error?.code === "PGRST205" || result.error?.code === "42P01")
    return { rows: [] as T, available: false };
  if (result.error) throw new Error(result.error.message ?? "Finance records are unavailable.");
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new Error("Finance records did not match their contract.");
  return { rows: parsed.data, available: true };
}
