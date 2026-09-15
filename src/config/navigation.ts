export const navigationItems = [
  { label: "Overview", icon: "home", href: "/", current: true },
  { label: "Sites & zones", icon: "pin", status: "Not implemented", current: false },
  { label: "Evidence review", icon: "document", status: "Not implemented", current: false },
  { label: "Incidents", icon: "alert", status: "Not implemented", current: false },
  { label: "Client reports", icon: "chart", status: "Not implemented", current: false },
] as const;

export type NavigationIcon = (typeof navigationItems)[number]["icon"];
