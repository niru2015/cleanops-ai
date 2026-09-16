export const navigationItems = [
  { label: "Overview", icon: "home", href: "/", implemented: true },
  { label: "Sites & zones", icon: "pin", href: "#", status: "Not implemented", implemented: false },
  { label: "Evidence review", icon: "document", href: "/review", implemented: true },
  { label: "Incidents", icon: "alert", href: "#", status: "Not implemented", implemented: false },
  { label: "Client reports", icon: "chart", href: "#", status: "Not implemented", implemented: false },
] as const;

export type NavigationIcon = (typeof navigationItems)[number]["icon"];
