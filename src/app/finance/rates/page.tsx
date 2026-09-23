import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RateWorkspace } from "@/components/rate-workspace";
import { getRateWorkspace } from "@/integrations/finance/supabase-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function WorkerRatesPage() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <p><Link href="/finance/time">Time review</Link></p>
    <h1>Worker cost rates</h1>
    {!access.canEditFinance ? <p>Confidential Director access is required.</p>
      : <RateWorkspace data={await getRateWorkspace(client, access)} />}
  </AppShell>;
}
