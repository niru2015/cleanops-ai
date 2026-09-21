import { AppShell } from "@/components/app-shell";
import { MobileTask } from "@/components/mobile-task";
import { getMobileWorkspace } from "@/integrations/operations/supabase-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { DEMO_MOBILE_TASK_ID, DEMO_SITE_ID, getOperationsRuntime } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MobilePage() {
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canUseCleanerMobile) {
      return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>Cleaner workflow restricted</h1><p>This role is not authorized for cleaner task capture.</p></section></AppShell>;
    }
    const hasFixtureSite = access.role === "organization_administrator" || access.sites.some((site) => site.id === DEMO_SITE_ID);
    if (!hasFixtureSite) {
      return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>No mobile task fixture for assigned casino</h1><p>This account is correctly restricted to its assigned casino; the current camera walkthrough is seeded at Grand Villa Casino.</p></section></AppShell>;
    }
    const runtime = await getOperationsRuntime("cleaner");
    const workspace = await getMobileWorkspace(runtime.accessClient, DEMO_MOBILE_TASK_ID);
    return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><MobileTask workspace={workspace} demo={runtime.demo} /></AppShell>;
  } catch {
    return <AppShell currentPath="/mobile"><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>Task access unavailable</h1><p>Sign in with an authorized cleaner account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
}
