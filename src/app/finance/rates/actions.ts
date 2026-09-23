"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

const inputSchema = z.object({ workerId: z.uuid(), rateType: z.enum(["regular", "overtime", "contractor"]),
  hourlyCost: z.number().nonnegative().max(10000), currency: z.literal("CAD"),
  effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().nullish(),
  reference: z.string().trim().max(180).nullish(), reason: z.string().trim().min(4).max(500) });

export async function saveWorkerCostRate(input: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const value = inputSchema.parse(input);
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canEditFinance) throw new Error("Director rate access required.");
    const result = await client.rpc("set_worker_cost_rate", { p_worker_id: value.workerId,
      p_rate_type: value.rateType, p_hourly_cost: value.hourlyCost, p_currency: value.currency,
      p_effective_from: value.effectiveFrom, p_effective_to: value.effectiveTo ?? null,
      p_reference: value.reference ?? null, p_reason: value.reason });
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/finance/rates"); revalidatePath("/finance/time");
    return { ok: true, message: "Effective worker cost rate saved with audit history." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Rate could not be saved." };
  }
}
