"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { performProjectAction } from "@/app/finance/projects/actions";

export type ProjectSummary = {
  project_id: string; site_id: string; project_code: string; name: string; state: string;
  starts_on?: string | null; ends_on?: string | null;
  scope?: string; contract_id?: string | null;
  recognized_source_count?: number; unresolved_source_count?: number; incomplete_source_count?: number;
  currency: string; pricing_model: string | null; expected_revenue: number | null;
  invoiced_revenue: number; recognized_revenue: number; labour_cost: number;
  expense_cost: number; supply_cost: number; direct_cost: number;
  expected_contribution: number | null; recognized_contribution: number | null;
  recognized_margin_pct: number | null; completeness: string;
};

type Source = { id: string; project_id: string | null; label: string; amount: number; kind: "time" | "expense" | "inventory_issue" | "accounting"; href?: string };

export function ProjectWorkspace({ projects, sites, contracts, sources, director }: {
  projects: ProjectSummary[]; sites: { id: string; name: string }[];
  contracts: { id: string; site_id: string; name: string }[]; sources: Source[]; director: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [site, setSite] = useState("all");
  const [state, setState] = useState("all");
  const [period, setPeriod] = useState("");
  const [newSite, setNewSite] = useState(sites[0]?.id ?? "");
  const money = (value: number | null, currency: string) => value === null ? "Pending" : new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);
  function run(input: Parameters<typeof performProjectAction>[0]) {
    start(async () => { const result = await performProjectAction(input); setMessage(result.message); });
  }
  return <>
    <section className="reviewCard"><h2>Create one-off project</h2>
      <p>Operational draft; a Director approves the commercial terms before it becomes active.</p>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget);
        run({ kind: "create", siteId: String(form.get("siteId")), code: String(form.get("code")), name: String(form.get("name")), scope: String(form.get("scope")),
          contractId: String(form.get("contractId") || "") || null }); }}>
        <label>Casino <select name="siteId" value={newSite} onChange={event => setNewSite(event.target.value)} required>{sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Parent contract <select name="contractId"><option value="">Standalone project</option>{contracts.filter(item => item.site_id === newSite).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Project code <input name="code" required maxLength={40} placeholder="HASTINGS-DEEP-CLEAN" /></label>
        <label>Name <input name="name" required maxLength={160} /></label>
        <label>Scope <textarea name="scope" required maxLength={2000} /></label>
        <button className="reviewButton reviewButton-primary" disabled={pending}>Create draft</button>
      </form>
    </section>
    <section className="reviewCard"><h2>Project contribution</h2>
      <p>Direct contribution uses approved operational cost. Accounting recognition is shown separately; final margin appears only after a complete import and Director cost close.</p>
      <label>Casino <select value={site} onChange={event => setSite(event.target.value)}><option value="all">All assigned casinos</option>{sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Status <select value={state} onChange={event => setState(event.target.value)}><option value="all">All</option>{["draft","active","completed","cancelled"].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Project month <input type="month" value={period} onChange={event => setPeriod(event.target.value)} /></label>
      {projects.filter(project => (site === "all" || project.site_id === site) && (state === "all" || project.state === state)
        && (!period || (!project.starts_on || project.starts_on.slice(0,7) <= period) && (!project.ends_on || project.ends_on.slice(0,7) >= period))).map(project => <article className="reviewCard" key={project.project_id}>
        <h3>{project.name} <span className="recordLabel">{project.project_code} · {project.state}</span></h3>
        <p>{sites.find(item => item.id === project.site_id)?.name} · {project.pricing_model ?? "Terms pending"} · {project.completeness}</p>
        <p>{project.scope}</p>
        <p>Accounting sources: {project.recognized_source_count ?? 0} recognized · {project.unresolved_source_count ?? 0} unresolved · {project.incomplete_source_count ?? 0} incomplete</p>
        <dl><dt>Expected revenue</dt><dd>{money(project.expected_revenue, project.currency)}</dd>
          <dt>Invoiced</dt><dd>{money(project.invoiced_revenue, project.currency)}</dd>
          <dt>Accounting recognized</dt><dd>{money(project.recognized_revenue, project.currency)}</dd>
          <dt>Approved labour</dt><dd>{money(project.labour_cost, project.currency)}</dd>
          <dt>Expense cost</dt><dd>{money(project.expense_cost, project.currency)}</dd>
          <dt>Issued supplies</dt><dd>{money(project.supply_cost, project.currency)}</dd>
          <dt>Direct cost</dt><dd>{money(project.direct_cost, project.currency)}</dd>
          <dt>Expected contribution</dt><dd>{money(project.expected_contribution, project.currency)}</dd>
          <dt>Recognized contribution</dt><dd>{money(project.recognized_contribution, project.currency)}</dd>
          <dt>Recognized margin</dt><dd>{project.recognized_margin_pct === null ? "Pending complete accounting and cost close" : `${project.recognized_margin_pct}%`}</dd></dl>
        <details><summary>Source drill-through and allocation</summary>
          <p>Link approved records from the same casino. Equipment purchases require asset review and are excluded from direct cost.</p>
          {sources.filter(source => source.project_id === project.project_id).map(source => <p key={source.id}>{source.kind}: {source.label} · {money(source.amount, project.currency)} · source {source.id} {source.href && <Link href={source.href}>Open source</Link>}</p>)}
          {director && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
            run({ kind: "link", projectId: project.project_id, sourceType: String(form.get("type")) as "time" | "expense" | "inventory_issue" | "accounting", sourceId: String(form.get("source")) }); }}>
            <select name="type" required>{["time","expense","inventory_issue","accounting"].map(type => <option key={type}>{type}</option>)}</select>
            <input name="source" required placeholder="Source record ID" /><button disabled={pending}>Link source</button>
          </form>}
        </details>
        {project.state === "draft" && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
          run({ kind: "scope", projectId: project.project_id, name: String(form.get("name")), scope: String(form.get("scope")),
            contractId: String(form.get("contractId") || "") || null }); }}>
          <label>Name <input name="name" defaultValue={project.name} required maxLength={160} /></label>
          <label>Scope <textarea name="scope" defaultValue={project.scope} required maxLength={2000} /></label>
          <label>Parent contract <select name="contractId" defaultValue={project.contract_id ?? ""}><option value="">Standalone project</option>
            {contracts.filter(item => item.site_id === project.site_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button disabled={pending}>Save draft scope</button>
        </form>}
        {director && project.state === "draft" && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
          run({ kind: "approve", projectId: project.project_id, model: String(form.get("model")) as "fixed" | "hourly", amount: Number(form.get("amount")) }); }}>
          <label>Pricing <select name="model"><option value="fixed">Fixed quote</option><option value="hourly">Hourly billing</option></select></label>
          <label>Quote or hourly rate <input name="amount" type="number" min="0" step="0.01" required /></label><button disabled={pending}>Approve terms and activate</button>
        </form>}
        {director && project.state !== "draft" && project.state !== "cancelled" && <>
          <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
            run({ kind: "invoice", projectId: project.project_id, reference: String(form.get("reference")), date: String(form.get("date")), amount: Number(form.get("amount")) }); }}>
            <label>Invoice reference <input name="reference" required /></label><label>Date <input name="date" type="date" required /></label>
            <label>Amount <input name="amount" type="number" min="0.01" step="0.01" required /></label><button disabled={pending}>Record invoice</button>
          </form>
          {project.pricing_model === "hourly" && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
            run({ kind: "billable", projectId: project.project_id, timeEntryId: String(form.get("time")), hours: Number(form.get("hours")) }); }}>
            <label>Approved time ID <input name="time" required /></label><label>Billable hours <input name="hours" type="number" step="0.000001" min="0.000001" required /></label>
            <button disabled={pending}>Approve billable hours</button>
          </form>}
          <button disabled={pending} onClick={() => run({ kind: "complete", projectId: project.project_id, complete: project.state !== "completed" })}>
            {project.state === "completed" ? "Reopen cost close" : "Mark costs complete"}</button>
          {project.state === "active" && <button disabled={pending} onClick={() => run({ kind: "cancel", projectId: project.project_id })}>Cancel project</button>}
        </>}
      </article>)}
      {!projects.length && <p>No projects yet.</p>}
    </section>
    {message && <p role="status">{message}</p>}
  </>;
}
