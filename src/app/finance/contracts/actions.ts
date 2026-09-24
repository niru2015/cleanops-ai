"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";
import { getContractDetail } from "@/integrations/finance/supabase-contracts";
import { contractDatesSchema, contractIdentitySchema, contractObligationSchema,
  contractResponsibilitiesSchema, contractSlaSchema, contractStaffingSchema,
  contractTermSchema } from "@/schemas/contracts";

function value(form: FormData, key: string) { return String(form.get(key) ?? ""); }
function target(id: string, step: number, message?: string) {
  return `/finance/contracts/new?draftId=${encodeURIComponent(id)}&step=${step}${message ? `&error=${encodeURIComponent(message)}` : ""}`;
}
function errorMessage(error: unknown) {
  return error instanceof z.ZodError ? error.issues[0]?.message ?? "Check this section."
    : error instanceof Error ? error.message : "The contract could not be saved.";
}

export async function createManualContract(form: FormData) {
  let destination = "/finance/contracts/new";
  try {
    const input = contractIdentitySchema.parse({ siteId: value(form, "siteId"),
      code: value(form, "code"), name: value(form, "name") });
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!isSiteAllowed(access, input.siteId) || !["organization_administrator", "area_manager"].includes(access.role))
      throw new Error("Contract setup is unavailable for this site.");
    const result = await client.rpc("create_manual_contract", {
      p_site_id: input.siteId, p_code: input.code, p_name: input.name });
    if (result.error || typeof result.data !== "string") throw new Error(result.error?.message ?? "The draft could not be created.");
    destination = target(result.data, 2);
    revalidatePath("/finance/contracts");
  } catch (error) {
    destination = `/finance/contracts/new?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(destination);
}

export async function saveContractStep(form: FormData) {
  const id = z.string().uuid().parse(value(form, "contractId"));
  const step = z.coerce.number().int().min(1).max(8).parse(value(form, "step"));
  let destination = target(id, step);
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!["organization_administrator", "area_manager"].includes(access.role)) throw new Error("Draft access is required.");
    const detail = await getContractDetail(client, access, id);
    const { contract, version } = detail;
    if (version.state !== "draft" || !isSiteAllowed(access, contract.site_id)) throw new Error("This draft is no longer editable.");
    const scope = { organization_id: access.organizationId, site_id: contract.site_id,
      contract_version_id: version.id };
    let result: { error: { message: string } | null };
    if (step === 1) {
      const input = contractIdentitySchema.parse({ siteId: contract.site_id,
        code: value(form, "code"), name: value(form, "name") });
      result = await client.from("contracts").update({ code: input.code, name: input.name,
        updated_at: new Date().toISOString() }).eq("id", id)
        .eq("organization_id", access.organizationId).eq("site_id", contract.site_id);
      destination = target(id, 2);
    } else if (step === 2) {
      const input = contractDatesSchema.parse({ effectiveFrom: value(form, "effectiveFrom"),
        effectiveTo: value(form, "effectiveTo"), renewalNotes: value(form, "renewalNotes"),
        referenceNotes: value(form, "referenceNotes") });
      result = await client.from("contract_versions").update({ effective_from: input.effectiveFrom,
        effective_to: input.effectiveTo || null, renewal_notes: input.renewalNotes || null,
        reference_notes: input.referenceNotes || null, updated_at: new Date().toISOString() })
        .eq("id", version.id).eq("organization_id", access.organizationId).eq("site_id", contract.site_id);
      destination = target(id, 3);
    } else if (step === 3) {
      const input = contractTermSchema.parse({ basis: value(form, "basis"), amount: value(form, "amount"),
        currency: value(form, "currency"), description: value(form, "description"),
        effectiveFrom: value(form, "effectiveFrom"), effectiveTo: value(form, "effectiveTo") });
      result = await client.from("contract_financial_terms").insert({ ...scope, basis: input.basis,
        amount: input.amount === "" ? null : input.amount, currency: input.currency || null,
        description: input.description || null, effective_from: input.effectiveFrom,
        effective_to: input.effectiveTo || null });
    } else if (step === 4) {
      const input = contractStaffingSchema.parse({ weekday: value(form, "weekday"),
        localStart: value(form, "localStart"), localEnd: value(form, "localEnd"),
        requiredPositions: value(form, "requiredPositions") });
      result = await client.from("contract_staffing_requirements").insert({ ...scope,
        weekday: input.weekday, local_start: input.localStart, local_end: input.localEnd,
        required_positions: input.requiredPositions });
    } else if (step === 5 || step === 6) {
      const input = contractObligationSchema.parse({ zoneId: value(form, "zoneId"),
        name: value(form, "name"), recurrence: value(form, "recurrence"),
        dueWindowMinutes: value(form, "dueWindowMinutes"),
        evidenceRequired: form.get("evidenceRequired") === "on",
        inspectionRequired: form.get("inspectionRequired") === "on" });
      result = await client.from("contract_obligations").insert({ ...scope, zone_id: input.zoneId,
        name: input.name, recurrence: input.recurrence, due_window_minutes: input.dueWindowMinutes,
        evidence_required: input.evidenceRequired, inspection_required: input.inspectionRequired,
        work_type: step === 6 ? "specialist" : "routine" });
    } else if (step === 7) {
      const input = contractSlaSchema.parse({ name: value(form, "name"),
        numeratorRule: value(form, "numeratorRule"), denominatorRule: value(form, "denominatorRule"),
        exclusionRule: value(form, "exclusionRule") });
      result = await client.from("contract_sla_terms").insert({ ...scope, name: input.name,
        numerator_rule: input.numeratorRule, denominator_rule: input.denominatorRule,
        exclusion_rule: input.exclusionRule });
    } else {
      const input = contractResponsibilitiesSchema.parse({ supply: value(form, "supply"),
        equipment: value(form, "equipment"), repair: value(form, "repair") });
      result = await client.from("contract_versions").update({ supply_responsibility: input.supply,
        equipment_responsibility: input.equipment, repair_responsibility: input.repair,
        updated_at: new Date().toISOString() }).eq("id", version.id)
        .eq("organization_id", access.organizationId).eq("site_id", contract.site_id);
      destination = `/finance/contracts/${id}/review`;
    }
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/finance/contracts");
    revalidatePath(`/finance/contracts/${id}/review`);
  } catch (error) {
    destination = target(id, step, errorMessage(error));
  }
  redirect(destination);
}

export async function transitionContract(form: FormData) {
  const id = z.string().uuid().parse(value(form, "contractId"));
  const transition = z.enum(["submit", "approve", "activate", "amend"]).parse(value(form, "transition"));
  let destination = `/finance/contracts/${id}/review`;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const detail = await getContractDetail(client, access, id);
    const { contract, version } = detail;
    if (!isSiteAllowed(access, contract.site_id)) throw new Error("Contract site access is required.");
    if (transition === "amend") {
      if (!["organization_administrator", "area_manager"].includes(access.role) || version.state !== "active")
        throw new Error("An active contract and draft access are required.");
      const result = await client.from("contract_versions").insert({ organization_id: access.organizationId,
        site_id: contract.site_id, contract_id: id, version_number: version.version_number + 1,
        source_type: "amendment", created_by: access.userId });
      if (result.error) throw new Error(result.error.message);
      destination = target(id, 2);
    } else {
      if (transition !== "submit" && access.role !== "organization_administrator")
        throw new Error("Director approval is required.");
      if (transition === "submit" && !["organization_administrator", "area_manager"].includes(access.role))
        throw new Error("Draft access is required.");
      const args = transition === "activate"
        ? { p_contract_version_id: version.id, p_preview_token: value(form, "previewToken") }
        : { p_contract_version_id: version.id };
      const result = transition === "submit"
        ? await client.rpc("submit_contract_version", args)
        : transition === "approve"
          ? await client.rpc("approve_contract_version", args)
          : await client.rpc("activate_contract_version", args);
      if (result.error) throw new Error(result.error.message);
    }
    revalidatePath("/finance/contracts");
    revalidatePath(destination);
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(destination);
}

export async function assignContractObligationZone(form: FormData) {
  const id = z.string().uuid().parse(value(form, "contractId"));
  let destination = `/finance/contracts/${id}/review`;
  try {
    const input = z.object({ obligationId: z.uuid(), zoneId: z.uuid() }).parse({
      obligationId: value(form, "obligationId"), zoneId: value(form, "zoneId") });
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!["organization_administrator", "area_manager"].includes(access.role))
      throw new Error("Contract draft access is required.");
    const detail = await getContractDetail(client, access, id);
    if (detail.version.state !== "draft" || !isSiteAllowed(access, detail.contract.site_id) ||
      !detail.obligations.some((item) => item.id === input.obligationId) ||
      !detail.zones.some((zone) => zone.id === input.zoneId))
      throw new Error("The obligation or zone is unavailable for this draft.");
    const result = await client.rpc("assign_contract_obligation_zone", {
      p_obligation_id: input.obligationId, p_zone_id: input.zoneId });
    if (result.error) throw new Error(result.error.message);
    revalidatePath(destination);
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(destination);
}

export async function removeContractDraftItem(form: FormData) {
  const id = z.string().uuid().parse(value(form, "contractId"));
  const itemId = z.string().uuid().parse(value(form, "itemId"));
  const kind = z.enum(["term", "obligation", "staffing", "sla"]).parse(value(form, "kind"));
  const step = z.coerce.number().int().min(3).max(7).parse(value(form, "step"));
  let destination = target(id, step);
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!["organization_administrator", "area_manager"].includes(access.role)) throw new Error("Draft access is required.");
    const detail = await getContractDetail(client, access, id);
    if (detail.version.state !== "draft" || !isSiteAllowed(access, detail.contract.site_id))
      throw new Error("This draft is no longer editable.");
    const table = { term: "contract_financial_terms", obligation: "contract_obligations",
      staffing: "contract_staffing_requirements", sla: "contract_sla_terms" }[kind];
    const result = await client.from(table).delete({ count: "exact" }).eq("id", itemId)
      .eq("organization_id", access.organizationId).eq("site_id", detail.contract.site_id)
      .eq("contract_version_id", detail.version.id);
    if (result.error) throw new Error(result.error.message);
    if (!result.count) throw new Error("That draft item is unavailable.");
    revalidatePath(destination);
    revalidatePath(`/finance/contracts/${id}/review`);
  } catch (error) {
    destination = target(id, step, errorMessage(error));
  }
  redirect(destination);
}
