import { AppShell } from "@/components/app-shell";

export default function FinanceLoading() {
  return <AppShell currentPath="/finance"><section className="accessState"><p className="eyebrow">Finance &amp; inventory</p><h1>Loading supervisor records…</h1></section></AppShell>;
}
