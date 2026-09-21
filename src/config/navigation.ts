import type { AppRole } from "@/services/access-context";

export const navigationItems = [
  { label: "Operations", icon: "home", href: "/operations", status: undefined, implemented: true, roles: ["site_supervisor","area_manager","operations_manager","organization_administrator"] },
  { label: "Sites & zones", icon: "pin", href: "/operations#zones-title", status: undefined, implemented: true, roles: ["site_supervisor","area_manager","operations_manager","organization_administrator"] },
  { label: "Cleaner mobile", icon: "mobile", href: "/mobile", status: undefined, implemented: true, roles: ["cleaner","organization_administrator"] },
  { label: "Evidence review", icon: "document", href: "/review", status: undefined, implemented: true, roles: ["site_supervisor","area_manager","operations_manager","organization_administrator"] },
  { label: "Finance & inventory", icon: "ledger", href: "/finance", status: undefined, implemented: true, roles: ["area_manager","organization_administrator"] },
  { label: "Incidents", icon: "alert", href: "/incidents", status: undefined, implemented: true, roles: ["site_supervisor","area_manager","operations_manager","organization_administrator"] },
  { label: "Client reports", icon: "chart", href: "/reports", status: undefined, implemented: true, roles: ["client_viewer","site_supervisor","area_manager","operations_manager","organization_administrator"] },
] as const satisfies readonly {
  label: string;
  icon: string;
  href: string;
  status: string | undefined;
  implemented: boolean;
  roles: readonly AppRole[];
}[];

export type NavigationIcon = (typeof navigationItems)[number]["icon"];
