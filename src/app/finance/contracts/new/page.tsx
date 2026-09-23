import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getContractDetail } from "@/integrations/finance/supabase-contracts";
import { createManualContract, removeContractDraftItem, saveContractStep } from "../actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sectionNames = ["Identity", "Dates", "Billing terms", "Staffing", "Recurring work",
  "Specialist work", "SLA and reporting", "Responsibilities", "Final review"];
const responsibilityOptions = ["unknown", "included", "reimbursable", "client_provided", "mixed"];

export default async function NewContractPage({ searchParams }: {
  searchParams: Promise<{ draftId?: string; step?: string; error?: string }>;
}) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const canDraft = ["organization_administrator", "area_manager"].includes(access.role);
  const step = params.draftId ? Math.max(1, Math.min(8, Number(params.step) || 2)) : 1;
  const detail = canDraft && params.draftId ? await getContractDetail(client, access, params.draftId) : null;
  const draft = detail?.version.state === "draft" ? detail : null;
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState">
      <p className="eyebrow">Finance / contracts / manual setup</p>
      <h1>{draft ? `${draft.contract.code} · ${sectionNames[step - 1]}` : "New manual contract"}</h1>
      <p>{!canDraft ? "Draft access is restricted." : "Save each section before continuing. Drafts remain available in the contract register."}</p>
      {params.error && <p role="alert">{params.error}</p>}
      {canDraft && !draft && <form action={createManualContract}>
        <label>Casino <select name="siteId" required>{access.sites.map((site) =>
          <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <label>Contract code <input name="code" required minLength={2} maxLength={80} /></label>
        <label>Contract name <input name="name" required minLength={2} maxLength={160} /></label>
        <button type="submit">Create draft and continue</button>
      </form>}
      {draft && <>
        <nav aria-label="Contract sections"><ol>{sectionNames.slice(0,8).map((name, index) =>
          <li key={name}><Link href={`/finance/contracts/new?draftId=${draft.contract.id}&step=${index + 1}`}>{name}</Link></li>)}</ol></nav>
        <form action={saveContractStep}>
          <input type="hidden" name="contractId" value={draft.contract.id} />
          <input type="hidden" name="step" value={step} />
          {step === 1 && <>
            <p>Casino: {draft.contract.siteName}. Create a separate draft for another casino.</p>
            <label>Contract code <input name="code" required minLength={2} maxLength={80} defaultValue={draft.contract.code} /></label>
            <label>Contract name <input name="name" required minLength={2} maxLength={160} defaultValue={draft.contract.name} /></label>
          </>}
          {step === 2 && <>
            <label>Effective from <input type="date" name="effectiveFrom" required defaultValue={draft.version.effective_from ?? ""} /></label>
            <label>Expires before <input type="date" name="effectiveTo" defaultValue={draft.version.effective_to ?? ""} /></label>
            <label>Renewal notes <textarea name="renewalNotes" defaultValue={draft.version.renewal_notes ?? ""} /></label>
            <label>Reference notes <textarea name="referenceNotes" defaultValue={draft.version.reference_notes ?? ""} /></label>
          </>}
          {step === 3 && <>
            <p>Saved terms: {draft.terms.length}. Add each commercial term separately.</p>
            <label>Billing model <select name="basis">{["fixed_monthly", "fixed_annual", "hourly", "per_shift", "project_fixed", "custom"].map((basis) =>
              <option key={basis} value={basis}>{basis.replaceAll("_", " ")}</option>)}</select></label>
            <label>Amount <input name="amount" type="number" min="0" step="0.01" /></label>
            <label>Currency <input name="currency" defaultValue="CAD" maxLength={3} /></label>
            <label>Effective from <input name="effectiveFrom" type="date" required defaultValue={draft.version.effective_from ?? ""} /></label>
            <label>Expires before <input name="effectiveTo" type="date" /></label>
            <label>Notes <textarea name="description" /></label>
          </>}
          {step === 4 && <>
            <p>Saved staffing rules: {draft.staffing.length}.</p>
            <label>Weekday <select name="weekday">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) =>
              <option key={day} value={index}>{day}</option>)}</select></label>
            <label>Start <input type="time" name="localStart" required /></label>
            <label>End <input type="time" name="localEnd" required /></label>
            <label>Required positions <input type="number" name="requiredPositions" min={1} defaultValue={1} required /></label>
          </>}
          {(step === 5 || step === 6) && <>
            <p>Saved {step === 6 ? "specialist" : "routine"} obligations: {draft.obligations.filter((item) => item.work_type === (step === 6 ? "specialist" : "routine")).length}. Add each task separately.</p>
            <label>Zone <select name="zoneId" required>{draft.zones.map((zone) =>
              <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
            <label>Service task <input name="name" required minLength={2} /></label>
            <label>Frequency <select name="recurrence">{(step === 6 ? ["monthly", "quarterly", "annual"] : ["daily", "weekly", "monthly", "quarterly", "annual"]).map((frequency) =>
              <option key={frequency} value={frequency}>{frequency}</option>)}</select></label>
            <label>Due window in minutes <input name="dueWindowMinutes" type="number" min={1} defaultValue={1440} required /></label>
            <label><input type="checkbox" name="evidenceRequired" defaultChecked /> Evidence required</label>
            <label><input type="checkbox" name="inspectionRequired" /> Inspection required</label>
          </>}
          {step === 7 && <>
            <p>Saved SLA definitions: {draft.sla.length}. Leave this section empty when the contract has no known SLA.</p>
            <label>SLA name <input name="name" required minLength={2} /></label>
            <label>Numerator rule <input name="numeratorRule" required minLength={2} /></label>
            <label>Denominator rule <input name="denominatorRule" required minLength={2} /></label>
            <label>Exclusion rule <input name="exclusionRule" required minLength={2} /></label>
          </>}
          {step === 8 && <>
            {(["supply", "equipment", "repair"] as const).map((field) =>
              <label key={field}>{field} responsibility <select name={field} defaultValue={draft.version[`${field}_responsibility`]}>
                {responsibilityOptions.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
              </select></label>)}
          </>}
          <button type="submit">Save {sectionNames[step - 1].toLowerCase()}</button>
        </form>
        {step >= 3 && step <= 7 && <ul>{(
          step === 3 ? draft.terms.map((item) => ({ id: item.id, kind: "term", label: `${item.basis}: ${item.amount ?? "unpriced"} ${item.currency ?? ""}` }))
          : step === 4 ? draft.staffing.map((item) => ({ id: item.id, kind: "staffing", label: `Weekday ${item.weekday} · ${item.local_start}–${item.local_end} · ${item.required_positions} positions` }))
          : step === 7 ? draft.sla.map((item) => ({ id: item.id, kind: "sla", label: item.name }))
          : draft.obligations.filter((item) => item.work_type === (step === 6 ? "specialist" : "routine"))
            .map((item) => ({ id: item.id, kind: "obligation", label: `${item.name} · ${item.recurrence}` }))
        ).map((item) => <li key={item.id}>{item.label}
          <form action={removeContractDraftItem}>
            <input type="hidden" name="contractId" value={draft.contract.id} />
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="kind" value={item.kind} />
            <input type="hidden" name="step" value={step} />
            <button type="submit" aria-label={`Remove ${item.label}`}>Remove</button>
          </form>
        </li>)}</ul>}
        {step < 8 && <p><Link href={`/finance/contracts/new?draftId=${draft.contract.id}&step=${step + 1}`}>Continue to {sectionNames[step].toLowerCase()}</Link></p>}
        <p><Link href={`/finance/contracts/${draft.contract.id}/review`}>Review saved draft</Link></p>
      </>}
      <p><Link href="/finance/contracts">Back to contract register</Link></p>
    </section>
  </AppShell>;
}
