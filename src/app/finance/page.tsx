import { AppShell } from "@/components/app-shell";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { MessageContextQueue } from "@/components/message-context-queue";
import { getFinanceWorkspace } from "@/integrations/finance/supabase-finance";
import { getMessageWorkspace } from "@/integrations/messages/supabase-message-context";
import { getOperationsRuntime } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FinancePage() {
  let loaded: { finance: Awaited<ReturnType<typeof getFinanceWorkspace>>; messages: Awaited<ReturnType<typeof getMessageWorkspace>> } | null = null;
  try {
    const runtime = await getOperationsRuntime("supervisor");
    const [finance, messages] = await Promise.all([getFinanceWorkspace(runtime.accessClient), getMessageWorkspace(runtime.accessClient, runtime.actorUserId)]);
    loaded = { finance, messages };
  } catch {}
  if (loaded) return <AppShell authenticated currentPath="/finance"><FinanceWorkspace workspace={loaded.finance} /><MessageContextQueue workspace={loaded.messages} /></AppShell>;
  return <AppShell currentPath="/finance"><section className="accessState"><p className="eyebrow">Finance &amp; inventory</p><h1>Supervisor access required</h1><p>Sign in with the hosted demo supervisor account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
}
