"use client";

import { useState, useTransition } from "react";
import { performTimeAction } from "@/app/finance/time/actions";
import type { getTimeWorkspace } from "@/integrations/finance/supabase-time";

type Workspace = Awaited<ReturnType<typeof getTimeWorkspace>>;
const today = () => new Date().toISOString().slice(0, 10);

export function TimeWorkspace({ data, director }: { data: Workspace; director: boolean }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [siteId, setSiteId] = useState(data.sites[0]?.id ?? "");
  const run = (value: Parameters<typeof performTimeAction>[0]) => start(async () => setNotice(await performTimeAction(value)));
  const names = new Map(data.workers.map(worker => [worker.id, worker.display_name]));
  const siteNames = new Map(data.sites.map(site => [site.id, site.name]));
  const visible = data.entries.filter(entry => entry.site_id === siteId);
  const outstanding = visible.filter(entry => entry.state === "exception" || entry.state === "draft").length;
  const approvedHours = visible.filter(entry => entry.state === "approved" || entry.state === "posted")
    .reduce((sum, entry) => sum + (entry.hours ?? 0), 0);
  return <div className="financeWorkspace">
    {notice && <p className={`reviewNotice ${notice.ok ? "reviewNoticeSuccess" : "reviewNoticeError"}`} role="status">{notice.message}</p>}
    <label>Casino <select value={siteId} onChange={event => setSiteId(event.target.value)}>
      {data.sites.map(site => <option value={site.id} key={site.id}>{site.name}</option>)}
    </select></label>
    <div className="financeMetricGrid"><div><span>Approved hours</span><strong>{approvedHours.toFixed(2)}</strong></div>
      <div><span>Needs review</span><strong>{outstanding}</strong></div></div>
    <section className="financePanel"><h2>Derive from attendance</h2>
      <p>Check-in and checkout create a draft. Missing checkout, worker swap and invalid duration stay exceptions until reviewed.</p>
      <form className="financeForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
        run({ kind: "derive", siteId, assignmentId: String(form.get("assignmentId")) }); }}>
        <label>Shift assignment <select name="assignmentId" required defaultValue=""><option value="" disabled>Select assignment</option>
          {data.assignments.filter(a => a.site_id === siteId).map(a => <option key={a.id} value={a.id}>{names.get(a.worker_id) ?? "Worker"} · {a.state} · {a.shift_id.slice(0, 8)}</option>)}
        </select></label><button className="reviewButton reviewButton-secondary" disabled={pending} type="submit">Check attendance</button>
      </form>
    </section>
    <section className="financePanel"><h2>Manual project time</h2>
      <form className="financeForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
        run({ kind: "manual", siteId, workerId: String(form.get("workerId")), workDate: String(form.get("workDate")),
          hours: Number(form.get("hours")), costType: String(form.get("costType")),
          projectReference: String(form.get("projectReference")), reason: String(form.get("reason")) }); }}>
        <label>Worker <select name="workerId" required defaultValue=""><option value="" disabled>Select worker</option>
          {data.workers.filter(worker => data.permissions.some(permission => permission.worker_id === worker.id && permission.site_id === siteId && permission.state === "active"))
            .map(worker => <option value={worker.id} key={worker.id}>{worker.display_name}</option>)}</select></label>
        <label>Project reference <input name="projectReference" minLength={2} maxLength={180} required /></label>
        <div className="financeFormRow"><label>Work date <input name="workDate" type="date" defaultValue={today()} required /></label>
          <label>Hours <input name="hours" type="number" min="0.000001" max="24" step="0.000001" required /></label></div>
        <label>Cost class <select name="costType"><option value="regular">Regular</option><option value="overtime">Overtime</option><option value="contractor">Contractor</option></select></label>
        <label>Reason <input name="reason" minLength={4} maxLength={500} required /></label>
        <button className="reviewButton reviewButton-secondary" disabled={pending} type="submit">Create draft time</button>
      </form>
    </section>
    <section className="financePanel"><h2>Time review</h2>
      {!visible.length && <p>No time entries yet for this casino.</p>}
      {visible.map(entry => <article className="reviewCard" key={entry.id}>
        <h3>{names.get(entry.worker_id) ?? "Worker"} · {entry.work_date} · {entry.state}</h3>
        <p>{siteNames.get(entry.site_id)} · {entry.source_type.replaceAll("_", " ")} · {entry.project_reference ?? "Shift"} · {entry.hours ?? "unresolved"} hours · {entry.cost_type}</p>
        {entry.exception_code && <p role="alert">Exception: {entry.exception_code.replaceAll("_", " ")}. Confirm the actual hours and cost class before approval.</p>}
        {entry.review_reason && <p>Review: {entry.review_reason}</p>}
        <details><summary>Time audit</summary><ul>{data.events.filter(event => event.time_entry_id === entry.id)
          .map(event => <li key={event.id}>{event.action.replaceAll("_", " ")} · {event.created_at} · {event.reason ?? "No reason"}</li>)}</ul></details>
        {(entry.state === "draft" || entry.state === "exception" || entry.state === "approved") && <form className="financeForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
          const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") as "approve" | "reject";
          run({ kind: "review", siteId, entryId: entry.id, decision,
            hours: decision === "approve" ? Number(form.get("hours")) : null,
            costType: decision === "approve" ? String(form.get("costType")) : null,
            reason: String(form.get("reason")) }); }}>
          <div className="financeFormRow"><label>Approved hours <input name="hours" type="number" min="0.000001" max="24" step="0.000001" defaultValue={entry.hours ?? ""} /></label>
            <label>Cost class <select name="costType" defaultValue={entry.cost_type}><option value="regular">Regular</option><option value="overtime">Overtime</option><option value="contractor">Contractor</option></select></label></div>
          <label>Reason <input name="reason" minLength={4} maxLength={500} required /></label>
          <button className="reviewButton reviewButton-primary" name="decision" value="approve" disabled={pending}>Approve hours</button>
          <button className="reviewButton reviewButton-secondary" name="decision" value="reject" disabled={pending}>Reject</button>
        </form>}
        {director && entry.state === "approved" && <button className="reviewButton reviewButton-primary" type="button" disabled={pending}
          onClick={() => run({ kind: "post", siteId, entryId: entry.id })}>Post approved cost</button>}
        {entry.state === "posted" && <p>Cost posted once · ledger {entry.labor_cost_entry_id}</p>}
      </article>)}
    </section>
  </div>;
}
