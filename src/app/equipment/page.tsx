import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { listEquipmentAssets } from "@/integrations/equipment/supabase-equipment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EquipmentPage() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const allowed = ["site_supervisor", "area_manager", "operations_manager", "organization_administrator"].includes(access.role);
  const assets = allowed ? await listEquipmentAssets(client, access) : [];
  const siteNames = new Map(access.sites.map((site) => [site.id, site.name]));
  return <AppShell authenticated currentPath="/equipment" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState">
      <p className="eyebrow">Equipment care</p><h1>Asset register</h1>
      <p>Site-scoped equipment history. Faults and repeated repairs are neutral records, not a finding of cause.</p>
      {!allowed ? <p>This role cannot view equipment care.</p> : assets.length === 0 ? <p>No equipment assets are available for your assigned sites.</p> :
        <ul>{assets.map((asset) => <li key={asset.id}>
          <Link href={`/equipment/${asset.id}`}>{asset.asset_code}</Link> · {siteNames.get(asset.site_id) ?? "Assigned site"}
          {` · ${asset.equipment_models?.manufacturer ?? "Unknown manufacturer"} ${asset.equipment_models?.model_name ?? "Unknown model"} · ${asset.status}`}
        </li>)}</ul>}
    </section>
  </AppShell>;
}
