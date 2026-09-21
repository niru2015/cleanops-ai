import { AppShell } from "@/components/app-shell";
import { OperationsCommand } from "@/components/operations-command";
import { getOperationsWorkspace } from "@/integrations/operations/supabase-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { DEMO_SITE_ID, getOperationsRuntime } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OperationsPage() {
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canManageOperations) {
      return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Operations command</p><h1>Operations access restricted</h1><p>This role does not manage casino operations.</p></section></AppShell>;
    }
    const hasFixtureSite = access.role === "organization_administrator" || access.sites.some((site) => site.id === DEMO_SITE_ID);
    if (!hasFixtureSite) {
      return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Operations command</p><h1>Assigned casinos</h1><p>This demo account is restricted to {access.sites.map((site) => site.name).join(", ")}. The detailed night-shift walkthrough is currently seeded only for Grand Villa Casino.</p></section></AppShell>;
    }
    const runtime = await getOperationsRuntime("supervisor");
    const workspace = await getOperationsWorkspace(runtime.accessClient);
    return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}><OperationsCommand workspace={workspace} /></AppShell>;
  } catch {
    return <AppShell currentPath="/operations"><section className="accessState"><p className="eyebrow">Operations command</p><h1>Sign in required</h1><p>Use an authorized CleanOps demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></section></AppShell>;
  }
}
