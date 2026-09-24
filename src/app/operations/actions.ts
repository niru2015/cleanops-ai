"use server";

import { revalidatePath } from "next/cache";
import { checkInReplacement, selectReplacement } from "@/integrations/operations/supabase-operations";
import { operationsActionSchema, type OperationsActionInput } from "@/schemas/operations";
import { resetHostedDemo } from "@/services/hosted-demo-reset";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { withHostedFixtureLease } from "@/services/hosted-demo-fixture";
import { getOperationsRuntime } from "@/services/operations-runtime";

export type OperationsActionState = { ok: boolean; message: string };

export async function performOperationsAction(input: OperationsActionInput): Promise<OperationsActionState> {
  const parsed = operationsActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The staffing request was invalid." };
  try {
    const runtime = await getOperationsRuntime("supervisor");
    if (parsed.data.action === "reset_hosted_demo") {
      if (!runtime.demo) throw new Error("Hosted demo access required.");
      const result = getDemoIngressConfig().enabled
        ? await resetHostedDemo(runtime.writeClient)
        : await withHostedFixtureLease(runtime.writeClient, runtime.actorUserId, "reset",
            () => resetHostedDemo(runtime.writeClient), (reset) => reset.storageRemoved);
      for (const path of ["/operations", "/mobile", "/review", "/incidents", "/reports", "/reports/client"]) {
        revalidatePath(path);
      }
      return {
        ok: result.storageRemoved,
        message: result.storageRemoved
          ? "The shared synthetic demo has been reset to its starting state."
          : "Demo records were reset, but one or more unlinked image objects could not be removed.",
      };
    }
    if (parsed.data.action === "select_replacement") {
      await selectReplacement(runtime.demo ? runtime.writeClient : runtime.accessClient, parsed.data.workerId, runtime.actorUserId);
    } else {
      await checkInReplacement(runtime.demo ? runtime.writeClient : runtime.accessClient, parsed.data.workerId, runtime.actorUserId);
    }
    revalidatePath("/operations");
    return parsed.data.action === "select_replacement"
      ? { ok: true, message: "Replacement selected and assigned by the supervisor. Coverage changes after check-in." }
      : { ok: true, message: "Eligible assigned worker checked in. Coverage recalculated from attendance records." };
  } catch {
    revalidatePath("/operations");
    return { ok: false, message: "The staffing update could not be saved. Review access and try again." };
  }
}
