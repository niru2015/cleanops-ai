import { AppShell } from "@/components/app-shell";
import { SupplyWorkspaceView } from "@/components/supply-workspace";
import { getSupplyWorkspace } from "@/integrations/supplies/supabase-supplies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic = "force-dynamic";

export default async function SuppliesPage({searchParams}:{searchParams:Promise<{siteId?:string;month?:string}>}) {
  const params = await searchParams;
  const loaded = await (async()=>{try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canManageOperations) throw new Error("restricted");
    const site = access.sites.find(entry=>entry.id===params.siteId)??access.sites[0];
    if (!site) return {access,site:null,month:"",workspace:null};
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month??"") ? params.month! : new Date().toISOString().slice(0,7);
    const workspace = await getSupplyWorkspace(client,access,site.id,month);
    return {access,site,month,workspace};
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Authentication required.") {
      console.error("Supply workspace load failed", error);
    }
    return null;
  }})();
  if (!loaded) return <AppShell currentPath="/supplies"><section className="accessState"><h1>Supplies unavailable</h1>
      <p>Sign in as a site Supervisor or manager with an active site grant. If you already have access, try again.</p>
    </section></AppShell>;
  if (!loaded.site || !loaded.workspace) return <AppShell authenticated role={loaded.access.role}
    roleLabel={loaded.access.roleLabel} currentPath="/supplies">
    <section className="accessState"><h1>No assigned sites</h1><p>Ask an administrator for site access before submitting a supply request.</p></section>
  </AppShell>;
  return <AppShell authenticated role={loaded.access.role} roleLabel={loaded.access.roleLabel} currentPath="/supplies">
    <SupplyWorkspaceView workspace={loaded.workspace} sites={loaded.access.sites} siteId={loaded.site.id}
      month={loaded.month} role={loaded.access.role} userId={loaded.access.userId}/>
  </AppShell>;
}
