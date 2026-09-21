import { AppShell } from "@/components/app-shell";
import { MobileTask } from "@/components/mobile-task";
import { getMobileWorkspace } from "@/integrations/operations/supabase-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, type AppAccessContext } from "@/services/access-context";
import { DEMO_MOBILE_TASK_ID, DEMO_SITE_ID, getOperationsRuntime } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  workspace: Awaited<ReturnType<typeof getMobileWorkspace>> | null;
  demo: boolean;
  fixtureAvailable: boolean;
};

export default async function MobilePage() {
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const fixtureAvailable =
      access.role === "organization_administrator" ||
      access.sites.some((site) => site.id === DEMO_SITE_ID);
    let workspace: Loaded["workspace"] = null;
    let demo = false;
    if (access.canUseCleanerMobile && fixtureAvailable) {
      const runtime = await getOperationsRuntime("cleaner");
      workspace = await getMobileWorkspace(runtime.accessClient, DEMO_MOBILE_TASK_ID);
      demo = runtime.demo;
    }
    loaded = { access, workspace, demo, fixtureAvailable };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/mobile"><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>Task access unavailable</h1><p>Sign in with an authorized cleaner account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
  const { access, workspace, demo, fixtureAvailable } = loaded;
  if (!access.canUseCleanerMobile) {
    return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>Cleaner workflow restricted</h1><p>This role is not authorized for cleaner task capture.</p></section></AppShell>;
  }
  if (!fixtureAvailable) {
    return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>No mobile task fixture for assigned casino</h1><p>This account is correctly restricted to its assigned casino; the current camera walkthrough is seeded at Grand Villa Casino.</p></section></AppShell>;
  }
  return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}>{workspace ? <MobileTask workspace={workspace} demo={demo} /> : null}</AppShell>;
}
