import { AppShell } from "@/components/app-shell";
import { TimeWorkspace } from "@/components/time-workspace";
import { SectionTabs } from "@/components/ui";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import { getTimeWorkspace } from "@/integrations/finance/supabase-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FinanceTimePage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <SectionTabs items={getFinanceSectionTabs(access.canEditFinance)} currentPath="/finance/time" ariaLabel="Finance sections" />
    <h1>Approved time and labour</h1>
    {!access.canManageOperations ? <p>Operational time access is restricted.</p>
      : <TimeWorkspace data={await getTimeWorkspace(client, access)} director={access.canEditFinance} initialSiteId={(await searchParams).siteId} />}
  </AppShell>;
}
