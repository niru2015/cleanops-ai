import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TimeWorkspace } from "@/components/time-workspace";
import { getTimeWorkspace } from "@/integrations/finance/supabase-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FinanceTimePage() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <p><Link href="/finance">Finance overview</Link>{access.canEditFinance && <> · <Link href="/finance/rates">Worker cost rates</Link></>}</p>
    <h1>Approved time and labour</h1>
    {!access.canManageOperations ? <p>Operational time access is restricted.</p>
      : <TimeWorkspace data={await getTimeWorkspace(client, access)} director={access.canEditFinance} />}
  </AppShell>;
}
