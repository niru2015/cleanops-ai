import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getContractDetail } from "@/integrations/finance/supabase-contracts";
import { ContractDocumentPanel, type DocumentView, type ProposalView,
  type DecisionView } from "@/components/contract-document-panel";
import { assignContractObligationZone, returnContractToDraft, transitionContract } from "../../actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const impactSchema = z.object({ token: z.string(), effectiveFrom: z.string(), tasks: z.number(),
  schedules: z.number(), coverageRequirements: z.number(), slaDefinitions: z.number(),
  revenueEntries: z.number(), firstRevenuePeriod: z.string().nullable(),
  firstRevenueAmount: z.number(), currency: z.string().nullable(), supersedes: z.number() });

export default async function ContractReviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const allowed = ["organization_administrator", "area_manager", "operations_manager"].includes(access.role);
  const detail = allowed ? await getContractDetail(client, access, z.string().uuid().parse(id)) : null;
  const version = detail?.version;
  const director = access.role === "organization_administrator";
  const canDraft = director || access.role === "area_manager";
  const [documentResult, proposalResult, decisionResult] = version ? await Promise.all([
    canDraft ? client.from("contract_documents")
      .select("id,file_name,status,detected_mime,page_count,created_at")
      .eq("organization_id", access.organizationId).eq("site_id", detail.contract.site_id)
      .eq("contract_version_id", version.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    client.from("contract_extraction_proposals")
      .select("id,field_key,category,business_state,proposed_value,source_page,source_span")
      .eq("organization_id", access.organizationId).eq("site_id", detail.contract.site_id)
      .eq("contract_version_id", version.id).order("created_at", { ascending: false }),
    client.from("contract_extraction_decisions")
      .select("proposal_id,decision,reviewed_value,reviewed_at,reason,canonical_table")
      .eq("organization_id", access.organizationId).eq("site_id", detail.contract.site_id)
      .eq("contract_version_id", version.id).order("reviewed_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const documents = z.array(z.object({ id: z.uuid(), file_name: z.string(), status: z.string(),
    detected_mime: z.string().nullable(), page_count: z.number().nullable(), created_at: z.string() }))
    .parse(documentResult.data) as DocumentView[];
  const proposals = z.array(z.object({ id: z.uuid(), field_key: z.string(), category: z.string(),
    business_state: z.string(), proposed_value: z.unknown(), source_page: z.number().nullable(),
    source_span: z.string().nullable() })).parse(proposalResult.data) as ProposalView[];
  const decisions = z.array(z.object({ proposal_id: z.uuid(), decision: z.string(),
    reviewed_value: z.unknown(), reviewed_at: z.string(), reason: z.string().nullable(),
    canonical_table: z.string().nullable() })).parse(decisionResult.data) as DecisionView[];
  const pendingMaterial = proposals.filter((proposal) => proposal.business_state !== "not_found" &&
    !decisions.some((decision) => decision.proposal_id === proposal.id)).length;
  const impactResult = director && version?.state === "approved"
    ? await client.rpc("preview_contract_activation", { p_contract_version_id: version.id }) : null;
  const impact = impactResult?.error ? null : impactSchema.safeParse(impactResult?.data).data;
  const missing = version ? [
    !version.effective_from && "effective date",
    canDraft && detail?.terms.length === 0 && "commercial term",
    detail?.obligations.some((item) => !item.zone_id) && "obligation zone",
  ].filter(Boolean) : [];
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState">
      <p className="eyebrow">Finance / contracts / review</p>
      {!detail || !version ? <h1>Contract access restricted</h1> : <>
        <h1>{detail.contract.code} · {detail.contract.name}</h1>
        <p>{detail.contract.siteName} · version {version.version_number} · {version.state} · {version.source_type}</p>
        {query.error && <p role="alert">{query.error}</p>}
        <h2>Identity and dates</h2>
        <p>Effective {version.effective_from ?? "unresolved"}{version.effective_to ? ` through ${version.effective_to}` : " onward"}.</p>
        {version.renewal_notes && <p>Renewal: {version.renewal_notes}</p>}
        {version.reference_notes && <p>Reference: {version.reference_notes}</p>}
        {canDraft && <><h2>Commercial terms</h2>
          {detail.terms.length ? <ul>{detail.terms.map((term) =>
            <li key={term.id}>{term.basis.replaceAll("_", " ")}: {term.amount ?? "unresolved"} {term.currency ?? ""} · {term.effective_from ?? "date unresolved"}{term.description ? ` · ${term.description}` : ""}</li>)}</ul>
            : <p>No commercial term saved.</p>}</>}
        <h2>Staffing</h2>
        {detail.staffing.length ? <ul>{detail.staffing.map((item) =>
          <li key={item.id}>Weekday {item.weekday}, {item.local_start}–{item.local_end}, {item.required_positions} positions</li>)}</ul>
          : <p>No staffing requirement saved.</p>}
        <h2>Service obligations</h2>
        {detail.obligations.length ? <ul>{detail.obligations.map((item) =>
          <li key={item.id}>{item.name} · {item.work_type} · {item.recurrence} · {detail.zones.find((zone) => zone.id === item.zone_id)?.name ?? "zone unresolved"} · evidence {item.evidence_required ? "required" : "optional"}
            {canDraft && version.state === "draft" && <form action={assignContractObligationZone}>
              <input type="hidden" name="contractId" value={detail.contract.id} />
              <input type="hidden" name="obligationId" value={item.id} />
              <label>Zone for {item.name} <select name="zoneId" defaultValue={item.zone_id ?? ""} required>
                <option value="" disabled>Select zone</option>
                {detail.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select></label>
              <button type="submit">Save obligation zone</button>
            </form>}
          </li>)}</ul>
          : <p>No recurring obligation saved.</p>}
        <h2>SLA and reporting</h2>
        {detail.sla.length ? <ul>{detail.sla.map((item) => <li key={item.id}>{item.name}: {item.numerator_rule} / {item.denominator_rule}; exclusion: {item.exclusion_rule}</li>)}</ul>
          : <p>No SLA definition saved.</p>}
        <h2>Responsibilities</h2>
        <p>Supplies: {version.supply_responsibility}; equipment: {version.equipment_responsibility}; repairs: {version.repair_responsibility}.</p>
        <ContractDocumentPanel contractId={detail.contract.id} canUpload={canDraft && version.state === "draft"}
          canReadDocuments={canDraft}
          canReview={version.state === "draft"} operationalOnly={!canDraft}
          documents={documents} proposals={proposals} decisions={decisions} />
        {missing.length > 0 && <p role="alert">Resolve before approval: {missing.join(", ")}.</p>}
        {version.state === "draft" && canDraft && <>
          <p><Link href={`/finance/contracts/new?draftId=${detail.contract.id}&step=2`}>Continue editing draft</Link></p>
          {pendingMaterial > 0 && <p role="alert">Review {pendingMaterial} source proposal{pendingMaterial === 1 ? "" : "s"} before submission.</p>}
          <form action={transitionContract}><input type="hidden" name="contractId" value={detail.contract.id} />
            <input type="hidden" name="transition" value="submit" /><button type="submit" disabled={pendingMaterial > 0}>Submit for review</button></form>
        </>}
        {version.state === "in_review" && canDraft && <form action={returnContractToDraft}>
          <input type="hidden" name="contractId" value={detail.contract.id} />
          <label>Revision reason <textarea name="reason" minLength={5} maxLength={500} required /></label>
          <button type="submit">Return to draft for revision</button>
        </form>}
        {(version.state === "draft" || version.state === "in_review") && director && <form action={transitionContract}>
          <input type="hidden" name="contractId" value={detail.contract.id} />
          <input type="hidden" name="transition" value="approve" /><button type="submit">Approve this version</button>
        </form>}
        {version.state === "approved" && director && <>
          <h2>Activation impact preview</h2>
          {impact ? <>
            <p>Effective {impact.effectiveFrom}. Create {impact.tasks} tasks, {impact.schedules} schedules,
              {` ${impact.coverageRequirements}`} shift coverage requirements, {impact.slaDefinitions} SLA definitions and {impact.revenueEntries} expected revenue entries.</p>
            <p>First expected revenue: {impact.firstRevenueAmount} {impact.currency ?? ""} for {impact.firstRevenuePeriod ?? "no fixed-fee period"}.</p>
            <p>Prior active versions affected: {impact.supersedes}.</p>
            <form action={transitionContract}><input type="hidden" name="contractId" value={detail.contract.id} />
              <input type="hidden" name="transition" value="activate" />
              <input type="hidden" name="previewToken" value={impact.token} />
              <button type="submit">Activate approved version</button></form>
          </> : <p role="alert">Activation preview is unavailable. No changes have been applied.</p>}
        </>}
        {version.state === "active" && canDraft && <form action={transitionContract}>
          <input type="hidden" name="contractId" value={detail.contract.id} />
          <input type="hidden" name="transition" value="amend" />
          <button type="submit">Create future amendment draft</button></form>}
      </>}
      <p><Link href="/finance/contracts">Back to contract register</Link></p>
    </section>
  </AppShell>;
}
