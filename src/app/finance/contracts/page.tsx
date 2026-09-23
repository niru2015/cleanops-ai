import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { listContracts } from "@/integrations/finance/supabase-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ContractsPage() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const allowed = ["organization_administrator", "area_manager", "operations_manager"].includes(access.role);
  const contracts = allowed ? await listContracts(client, access) : [];
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState">
      <p className="eyebrow">Finance / contracts</p>
      <h1>Contract register</h1>
      {!allowed ? <p>Contract administration is restricted.</p> : <>
        <p>Approved terms become operational requirements and expected revenue only after Director activation.</p>
        {access.role !== "operations_manager" && <p><Link href="/finance/contracts/new">Create manual contract</Link></p>}
        {contracts.length === 0 ? <p>No contracts are available for your assigned casinos.</p> :
          <ul>{contracts.map((contract) => {
            const version = contract.versions[0];
            return <li key={contract.id}>
              <Link href={`/finance/contracts/${contract.id}/review`}>{contract.code} · {contract.name}</Link>
              {` — ${contract.siteName}; ${version ? `v${version.version_number} ${version.state}` : "no version"}`}
              {version?.effective_from ? `; ${version.effective_from}${version.effective_to ? ` to ${version.effective_to}` : " onward"}` : ""}
              {version ? `; ${version.source_type}` : ""}
            </li>;
          })}</ul>}
      </>}
    </section>
  </AppShell>;
}
