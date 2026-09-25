import type { SectionTabItem } from "@/components/ui/section-tabs";

export function getFinanceSectionTabs(canEditFinance: boolean): SectionTabItem[] {
  return [
    { label: "Overview", href: "/finance" },
    { label: "Contracts", href: "/finance/contracts" },
    { label: "Projects", href: "/finance/projects" },
    { label: "Finance Inbox", href: "/finance/inbox" },
    { label: "Expenses", href: "/finance/expenses" },
    { label: "Time & labour", href: "/finance/time" },
    { label: "Reconciliation", href: "/finance/reconciliation" },
    { label: "Rates", href: "/finance/rates", hidden: !canEditFinance },
  ];
}
