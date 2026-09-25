import { AppShell } from "@/components/app-shell";
import { ExpenseInbox } from "@/components/expense-inbox";
import { SectionTabs } from "@/components/ui";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import { getExpenseWorkspace } from "@/integrations/finance/supabase-expenses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic="force-dynamic";
export default async function FinanceInboxPage(){
  const loaded=await (async()=>{try{
    const client=await createSupabaseServerClient();
    const access=await getAppAccessContext(client);
    if(!access.canViewFinance)throw new Error("restricted");
    const data=await getExpenseWorkspace(client,access);
    return {access,data};
  }catch{return null;}})();
  if(!loaded)return <AppShell currentPath="/finance"><section className="accessState"><h1>Finance Inbox unavailable</h1>
    <p>Director or assigned Area Manager access is required.</p></section></AppShell>;
  const {access,data}=loaded;
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
      <SectionTabs items={getFinanceSectionTabs(access.canEditFinance)} currentPath="/finance/inbox" ariaLabel="Finance sections" />
      <h1>Finance Inbox</h1>
      <ExpenseInbox intakes={data.intakes.filter(i=>i.review_state!=="posted"&&i.review_state!=="rejected")}
        documents={data.documents} claims={data.claims} sites={access.sites}/>
    </AppShell>;
}
