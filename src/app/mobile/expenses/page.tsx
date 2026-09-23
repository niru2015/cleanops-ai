import { AppShell } from "@/components/app-shell";
import { ExpenseSubmission } from "@/components/expense-submission";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic="force-dynamic";
export default async function MobileExpensesPage(){
  const access=await (async()=>{try{
    const access=await getAppAccessContext(await createSupabaseServerClient());
    if(!["cleaner","site_supervisor","area_manager"].includes(access.role))throw new Error("restricted");
    return access;
  }catch{return null;}})();
  if(!access)return <AppShell currentPath="/mobile"><section className="accessState"><h1>Expense submission unavailable</h1>
    <p>Sign in with an assigned Cleaner, Supervisor or Area Manager account.</p></section></AppShell>;
  return <AppShell authenticated currentPath="/mobile" role={access.role} roleLabel={access.roleLabel}>
    <h1>Submit an expense</h1><ExpenseSubmission sites={access.sites}/>
  </AppShell>;
}
