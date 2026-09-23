"use client";

import { useState, useTransition } from "react";
import { saveWorkerCostRate } from "@/app/finance/rates/actions";
import type { getRateWorkspace } from "@/integrations/finance/supabase-time";

type Workspace = Awaited<ReturnType<typeof getRateWorkspace>>;
export function RateWorkspace({ data }: { data: Workspace }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const names = new Map(data.workers.map(worker => [worker.id, worker.display_name]));
  return <div className="financeWorkspace">
    {notice && <p className={`reviewNotice ${notice.ok ? "reviewNoticeSuccess" : "reviewNoticeError"}`} role="status">{notice.message}</p>}
    <section className="financePanel"><h2>Set effective cost rate</h2>
      <p>Confidential Director-only cost rates. A new rate closes the prior active interval. Posted costs keep their original snapshot.</p>
      <form className="financeForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
        start(async () => setNotice(await saveWorkerCostRate({ workerId: String(form.get("workerId")),
          rateType: String(form.get("rateType")), hourlyCost: Number(form.get("hourlyCost")), currency: "CAD",
          effectiveFrom: String(form.get("effectiveFrom")), effectiveTo: String(form.get("effectiveTo")) || null,
          reference: String(form.get("reference")) || null, reason: String(form.get("reason")) }))); }}>
        <label>Worker <select name="workerId" required defaultValue=""><option value="" disabled>Select worker</option>
          {data.workers.map(worker => <option key={worker.id} value={worker.id}>{worker.display_name}</option>)}</select></label>
        <label>Rate class <select name="rateType"><option value="regular">Regular</option><option value="overtime">Overtime</option><option value="contractor">Contractor</option></select></label>
        <div className="financeFormRow"><label>Hourly cost CAD <input name="hourlyCost" type="number" min="0" max="10000" step="0.0001" required /></label>
          <label>Effective from <input name="effectiveFrom" type="date" required /></label></div>
        <label>Effective until (exclusive) <input name="effectiveTo" type="date" /></label>
        <label>Reference <input name="reference" maxLength={180} /></label>
        <label>Reason <input name="reason" minLength={4} maxLength={500} required /></label>
        <button className="reviewButton reviewButton-primary" disabled={pending}>Save rate</button>
      </form>
    </section>
    <section className="financePanel"><h2>Rate history</h2>
      {!data.rates.length && <p>No rates entered.</p>}
      <ul>{data.rates.map(rate => <li key={rate.id}>{names.get(rate.worker_id) ?? "Worker"} · {rate.rate_type} · {rate.currency} {rate.hourly_cost.toFixed(4)}/hour · {rate.effective_from} to {rate.effective_to ?? "open"} · {rate.state} · {rate.reason}
        <details><summary>Rate audit</summary><ul>{data.events.filter(event => event.rate_id === rate.id)
          .map(event => <li key={event.id}>{event.action} · {event.created_at} · {event.reason}</li>)}</ul></details>
      </li>)}</ul>
    </section>
  </div>;
}
