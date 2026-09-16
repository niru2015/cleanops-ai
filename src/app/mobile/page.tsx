import { AppShell } from "@/components/app-shell";
import { MobileTask } from "@/components/mobile-task";
import { getMobileWorkspace } from "@/integrations/operations/supabase-operations";
import { DEMO_MOBILE_TASK_ID, getOperationsRuntime } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MobilePage() {
  let loaded: { workspace: Awaited<ReturnType<typeof getMobileWorkspace>>; demo: boolean } | null = null;
  try {
    const runtime = await getOperationsRuntime();
    loaded = { workspace: await getMobileWorkspace(runtime.accessClient, DEMO_MOBILE_TASK_ID), demo: runtime.demo };
  } catch {}
  if (loaded) return <AppShell currentPath="/mobile"><MobileTask workspace={loaded.workspace} demo={loaded.demo} /></AppShell>;
  return <AppShell currentPath="/mobile"><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>Task access unavailable</h1><p>Sign in as the assigned cleaner or start the local synthetic demo.</p></section></AppShell>;
}
