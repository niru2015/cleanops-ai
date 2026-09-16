import { AppShell } from "@/components/app-shell";
import { OperationsCommand } from "@/components/operations-command";
import { getOperationsWorkspace } from "@/integrations/operations/supabase-operations";
import { getOperationsRuntime } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OperationsPage() {
  let loaded: Awaited<ReturnType<typeof getOperationsWorkspace>> | null = null;
  try {
    const runtime = await getOperationsRuntime();
    loaded = await getOperationsWorkspace(runtime.accessClient);
  } catch {}
  if (loaded) return <AppShell currentPath="/operations"><OperationsCommand workspace={loaded} /></AppShell>;
  return <AppShell currentPath="/operations"><section className="accessState"><p className="eyebrow">Operations command</p><h1>Supervisor access required</h1><p>Start the local synthetic demo or sign in with access to this site.</p></section></AppShell>;
}
