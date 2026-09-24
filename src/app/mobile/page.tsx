import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { MobileTask } from "@/components/mobile-task";
import { getCaptureTaskOptions, getMobileWorkspace } from "@/integrations/operations/supabase-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, type AppAccessContext } from "@/services/access-context";
import { DEMO_MOBILE_TASK_ID, DEMO_SITE_ID, getOperationsRuntime } from "@/services/operations-runtime";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  workspace: Awaited<ReturnType<typeof getMobileWorkspace>> | null;
  demo: boolean;
  fixtureAvailable: boolean;
  taskOptions: Awaited<ReturnType<typeof getCaptureTaskOptions>>;
};

export default async function MobilePage({ searchParams }: { searchParams: Promise<{ taskRunId?: string | string[] }> }) {
  const requested = (await searchParams).taskRunId;
  const taskRunId = requested === undefined ? DEMO_MOBILE_TASK_ID
    : typeof requested === "string" && z.string().uuid().safeParse(requested).success ? requested : null;
  if (!taskRunId) return <AppShell currentPath="/mobile"><section className="accessState"><h1>Task not found</h1><p>Choose a task from Operations or Review.</p></section></AppShell>;
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const fixtureAvailable =
      access.role === "organization_administrator" ||
      access.sites.some((site) => site.id === DEMO_SITE_ID);
    let workspace: Loaded["workspace"] = null;
    let taskOptions: Loaded["taskOptions"] = [];
    let demo = false;
    if ((access.canUseCleanerMobile || access.canManageOperations) && fixtureAvailable) {
      try {
        const runtime = await getOperationsRuntime("capture");
        taskOptions = await getCaptureTaskOptions(runtime.writeClient);
        if (taskOptions.some((task) => task.id === taskRunId)) {
          workspace = await getMobileWorkspace(runtime.accessClient, taskRunId);
        }
        demo = runtime.demo;
      } catch {}
    }
    loaded = { access, workspace, demo, fixtureAvailable, taskOptions };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/mobile"><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>Task access unavailable</h1><p>Sign in with an authorized cleaner account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
  const { access, workspace, demo, fixtureAvailable, taskOptions } = loaded;
  if (!access.canUseCleanerMobile && !access.canManageOperations) {
    return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>Cleaner workflow restricted</h1><p>This role is not authorized for cleaner task capture.</p></section></AppShell>;
  }
  if (!fixtureAvailable) {
    return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><p><Link href="/mobile/expenses">Submit an expense and receipt</Link></p><section className="accessState"><p className="eyebrow">Cleaner mobile</p><h1>No mobile task fixture for assigned casino</h1><p>This account is correctly restricted to its assigned casino; the current camera walkthrough is seeded at Grand Villa Casino.</p></section></AppShell>;
  }
  return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}><p><Link href="/mobile/expenses">Submit an expense and receipt</Link></p>{workspace ? <MobileTask workspace={workspace} demo={demo} actorRole={access.roleLabel} taskOptions={taskOptions} /> : <section className="accessState"><h1>Task unavailable</h1><p>This task is not accessible to your role or site.</p></section>}</AppShell>;
}
