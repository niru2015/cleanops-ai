export const navigationItems = [
  { label: "Operations", icon: "home", href: "/operations", status: undefined, implemented: true },
  { label: "Sites & zones", icon: "pin", href: "/operations#zones-title", status: undefined, implemented: true },
  { label: "Cleaner mobile", icon: "mobile", href: "/mobile", status: undefined, implemented: true },
  { label: "Evidence review", icon: "document", href: "/review", status: undefined, implemented: true },
  { label: "Incidents", icon: "alert", href: "/incidents", status: undefined, implemented: true },
  { label: "Client reports", icon: "chart", href: "/reports", status: undefined, implemented: true },
] as const;

export type NavigationIcon = (typeof navigationItems)[number]["icon"];
