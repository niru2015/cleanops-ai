import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isHostedDemoEnabled } from "@/services/hosted-demo";

const resetRowSchema = z.object({ storage_path: z.string().min(1) });

export async function resetHostedDemo(client: SupabaseClient) {
  if (!isHostedDemoEnabled()) throw new Error("Hosted demo reset is disabled.");

  const { data, error } = await client.rpc("reset_hosted_demo");
  if (error) throw new Error("The hosted demo records could not be reset.");

  const parsed = z.array(resetRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error("The hosted demo reset response was invalid.");

  const paths = [...new Set(parsed.data.map((row) => row.storage_path))];
  if (paths.length === 0) return { storageRemoved: true, removedObjectCount: 0 };

  const removal = await client.storage.from("operational-evidence").remove(paths);
  return {
    storageRemoved: removal.error === null,
    removedObjectCount: removal.error === null ? paths.length : 0,
  };
}
