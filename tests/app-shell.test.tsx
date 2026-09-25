import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/app-shell";
import { navigationItems } from "@/config/navigation";

describe("CLEAN-001 application shell", () => {
  it("renders the prototype boundary and an honest empty state", () => {
    const html = renderToStaticMarkup(<AppShell />);

    expect(html).toContain("Prototype");
    expect(html).toContain("synthetic data");
    expect(html).toContain("Operations workspace");
    expect(html).toContain("Open Operations");
    expect(html).not.toContain("AI verified");
  });

  it("exposes all implemented operations journeys", () => {
    const implementedItems = navigationItems.filter((item) => item.implemented);
    const plannedItems = navigationItems.filter((item) => !item.implemented);

    expect(implementedItems.map((item) => item.label)).toEqual(["Operations", "Sites & zones", "Cleaner mobile", "Evidence review", "Supplies", "Finance & inventory", "Incidents", "Client reports"]);
    expect(plannedItems).toHaveLength(0);
  });
});
