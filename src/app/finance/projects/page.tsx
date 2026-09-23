import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ProjectWorkspace, type ProjectSummary } from "@/components/project-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const summary = z.object({ project_id: z.uuid(), site_id: z.uuid(), project_code: z.string(),
  name: z.string(), state: z.string(), currency: z.string(), pricing_model: z.string().nullable(),
  expected_revenue: z.number().nullable(), invoiced_revenue: z.number(), recognized_revenue: z.number(),
  labour_cost: z.number(), expense_cost: z.number(), supply_cost: z.number(), direct_cost: z.number(),
  expected_contribution: z.number().nullable(), recognized_contribution: z.number().nullable(),
  recognized_margin_pct: z.number().nullable(), completeness: z.string() });

export default async function ProjectsPage() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const result = access.canViewFinance ? await client.rpc("list_finance_projects", { p_site_id: null }) : null;
  if (result?.error) throw new Error(result.error.message);
  const projects: ProjectSummary[] = z.array(summary).parse(result?.data ?? []);
  const contractsResult = access.canViewFinance && access.sites.length ? await client.from("contracts")
    .select("id,site_id,name").eq("organization_id", access.organizationId)
    .in("site_id", access.sites.map(item => item.id)).limit(200) : null;
  if (contractsResult?.error) throw new Error(contractsResult.error.message);
  const reconciliation = access.canViewFinance ? await client.rpc("list_finance_project_reconciliation") : null;
  if (reconciliation?.error) throw new Error(reconciliation.error.message);
  const reconciliationRows = z.array(z.object({ project_id: z.uuid(), recognized_source_count: z.number(),
    unresolved_source_count: z.number(), incomplete_source_count: z.number() })).parse(reconciliation?.data ?? []);
  for (const item of projects) {
    const state = reconciliationRows.find(row => row.project_id === item.project_id);
    item.recognized_source_count = state?.recognized_source_count ?? 0;
    item.unresolved_source_count = state?.unresolved_source_count ?? 0;
    item.incomplete_source_count = state?.incomplete_source_count ?? 0;
  }
  if (projects.length) {
    const dates = await client.from("projects").select("id,starts_on,ends_on,scope,contract_id")
      .eq("organization_id", access.organizationId).in("id", projects.map(item => item.project_id));
    if (dates.error) throw new Error(dates.error.message);
    for (const item of projects) {
      const date = dates.data?.find(row => row.id === item.project_id);
      item.starts_on = date?.starts_on ?? null;
      item.ends_on = date?.ends_on ?? null;
      item.scope = date?.scope ?? "";
      item.contract_id = date?.contract_id ?? null;
    }
  }
  const sources: { id: string; project_id: string | null; label: string; amount: number; kind: "time" | "expense" | "inventory_issue" | "accounting"; href?: string }[] = [];
  if (access.canEditFinance && projects.length) {
    const [time, expenses, issues, allocations, links] = await Promise.all([
      client.from("labor_cost_entries").select("id,project_id,time_entry_id,total_cost,work_date").eq("organization_id", access.organizationId).not("project_id", "is", null).limit(200),
      client.from("expense_postings").select("id,project_id,claim_id,amount,category").eq("organization_id", access.organizationId).limit(200),
      client.from("inventory_transactions").select("id,site_id,project_id,total_cost,transaction_type").eq("organization_id", access.organizationId).eq("transaction_type", "issue").limit(200),
      client.from("finance_source_allocations").select("id,project_id,amount,job_reference").eq("organization_id", access.organizationId).limit(200),
      client.from("project_source_links").select("source_id,project_id,source_type").eq("organization_id", access.organizationId).limit(300),
    ]);
    for (const result of [time, expenses, issues, allocations, links]) if (result.error) throw new Error(result.error.message);
    const linked = new Map((links.data ?? []).map(item => [`${item.source_type}:${item.source_id}`, item.project_id]));
    for (const item of time.data ?? []) if (item.project_id) sources.push({ id: item.id, project_id: item.project_id,
      label: `Approved labour · ${item.work_date}`, amount: Number(item.total_cost), kind: "time",
      href: item.time_entry_id ? `/finance/time#${item.time_entry_id}` : undefined });
    for (const item of expenses.data ?? []) if (item.category !== "equipment_purchase" && (item.project_id || linked.has(`expense:${item.id}`)))
      sources.push({ id: item.id, project_id: item.project_id ?? linked.get(`expense:${item.id}`) ?? null,
        label: item.category, amount: Number(item.amount), kind: "expense", href: `/finance/expenses#${item.claim_id}` });
    for (const item of issues.data ?? []) if (item.project_id || linked.has(`inventory_issue:${item.id}`))
      sources.push({ id: item.id, project_id: item.project_id ?? linked.get(`inventory_issue:${item.id}`) ?? null,
        label: "Issued supplies", amount: Number(item.total_cost), kind: "inventory_issue",
        href: `/finance?siteId=${item.site_id}#${item.id}` });
    for (const item of allocations.data ?? []) if (item.project_id || linked.has(`accounting:${item.id}`))
      sources.push({ id: item.id, project_id: item.project_id ?? linked.get(`accounting:${item.id}`) ?? null,
        label: `Accounting allocation · ${item.job_reference ?? "project"}`, amount: Number(item.amount), kind: "accounting" });
  }
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <p><Link href="/finance">Finance overview</Link></p>
    <h1>One-off project profitability</h1>
    {!access.canViewFinance ? <p>Finance access restricted.</p> : <ProjectWorkspace
      projects={projects} sites={access.sites.map(site => ({ id: site.id, name: site.name }))}
      contracts={contractsResult?.data ?? []} sources={sources} director={access.canEditFinance} />}
  </AppShell>;
}
