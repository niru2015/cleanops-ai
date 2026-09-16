export const navigationItems = [
  { label: "Operations", icon: "home", href: "/operations", implemented: true },
  { label: "Sites & zones", icon: "pin", href: "/operations#zones-title", implemented: true },
  { label: "Cleaner mobile", icon: "mobile", href: "/mobile", implemented: true },
  { label: "Evidence review", icon: "document", href: "/review", implemented: true },
  { label: "Incidents", icon: "alert", href: "#", status: "Not implemented", implemented: false },
  { label: "Client reports", icon: "chart", href: "#", status: "Not implemented", implemented: false },
] as const;

export type NavigationIcon = (typeof navigationItems)[number]["icon"];
