import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AppAccessContext } from "@/services/access-context";

const id = z.string().uuid();
const contractSchema = z.object({ id, organization_id: id, site_id: id, client_id: id,
  code: z.string(), name: z.string(), state: z.string() });
const versionSchema = z.object({ id, organization_id: id, site_id: id, contract_id: id,
  version_number: z.number(), state: z.string(), source_type: z.string(),
  effective_from: z.string().nullable(), effective_to: z.string().nullable(),
  renewal_notes: z.string().nullable(), reference_notes: z.string().nullable(),
  supply_responsibility: z.string(), equipment_responsibility: z.string(),
  repair_responsibility: z.string(), approved_at: z.string().nullable(),
  activated_at: z.string().nullable() });
const termSchema = z.object({ id, basis: z.string(), amount: z.number().nullable(),
  currency: z.string().nullable(), description: z.string().nullable(),
  effective_from: z.string().nullable(), effective_to: z.string().nullable() });
const obligationSchema = z.object({ id, zone_id: id.nullable(), name: z.string(), work_type: z.string(),
  recurrence: z.string(), due_window_minutes: z.number(), evidence_required: z.boolean(),
  inspection_required: z.boolean() });
const staffingSchema = z.object({ id, weekday: z.number(), local_start: z.string(),
  local_end: z.string(), required_positions: z.number() });
const slaSchema = z.object({ id, name: z.string(), numerator_rule: z.string(),
  denominator_rule: z.string(), exclusion_rule: z.string() });
const zoneSchema = z.object({ id, name: z.string() });

async function read<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Contract records did not match their expected format.");
  return parsed.data;
}

export async function listContracts(client: SupabaseClient, access: AppAccessContext) {
  const siteIds = access.sites.map((site) => site.id);
  if (!siteIds.length) return [];
  const contracts = await read(client.from("contracts").select("id,organization_id,site_id,client_id,code,name,state")
    .eq("organization_id", access.organizationId).in("site_id", siteIds).order("name"), z.array(contractSchema));
  const versions = contracts.length ? await read(client.from("contract_versions")
    .select("id,organization_id,site_id,contract_id,version_number,state,source_type,effective_from,effective_to,renewal_notes,reference_notes,supply_responsibility,equipment_responsibility,repair_responsibility,approved_at,activated_at")
    .eq("organization_id", access.organizationId).in("contract_id", contracts.map((contract) => contract.id)), z.array(versionSchema)) : [];
  return contracts.map((contract) => ({ ...contract, siteName: access.sites.find((site) => site.id === contract.site_id)?.name ?? "Site",
    versions: versions.filter((version) => version.contract_id === contract.id)
      .sort((a, b) => b.version_number - a.version_number) }));
}

export async function getContractDetail(client: SupabaseClient, access: AppAccessContext, contractId: string) {
  const contracts = await listContracts(client, access);
  const contract = contracts.find((item) => item.id === contractId);
  if (!contract) throw new Error("Contract is unavailable for this account.");
  const version = contract.versions[0];
  if (!version) throw new Error("Contract version is missing.");
  const [terms, obligations, staffing, sla, zones] = await Promise.all([
    access.role === "organization_administrator" || access.role === "area_manager"
      ? read(client.from("contract_financial_terms")
        .select("id,basis,amount,currency,description,effective_from,effective_to")
        .eq("organization_id", access.organizationId).eq("site_id", contract.site_id)
        .eq("contract_version_id", version.id), z.array(termSchema))
      : Promise.resolve([] as z.infer<typeof termSchema>[]),
    read(client.from("contract_obligations")
      .select("id,zone_id,name,recurrence,work_type,due_window_minutes,evidence_required,inspection_required")
      .eq("organization_id", access.organizationId).eq("site_id", contract.site_id)
      .eq("contract_version_id", version.id), z.array(obligationSchema)),
    read(client.from("contract_staffing_requirements")
      .select("id,weekday,local_start,local_end,required_positions")
      .eq("organization_id", access.organizationId).eq("site_id", contract.site_id)
      .eq("contract_version_id", version.id), z.array(staffingSchema)),
    read(client.from("contract_sla_terms")
      .select("id,name,numerator_rule,denominator_rule,exclusion_rule")
      .eq("organization_id", access.organizationId).eq("site_id", contract.site_id)
      .eq("contract_version_id", version.id), z.array(slaSchema)),
    read(client.from("site_zones").select("id,name")
      .eq("organization_id", access.organizationId).eq("site_id", contract.site_id).order("name"),
      z.array(zoneSchema)),
  ]);
  return { contract, version, terms, obligations, staffing, sla, zones };
}
