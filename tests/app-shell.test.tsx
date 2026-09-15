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
    expect(html).toContain("Operational data will appear after CLEAN-002");
    expect(html).not.toContain("AI verified");
  });

  it("keeps only Overview active and labels every planned destination", () => {
    const activeItems = navigationItems.filter((item) => item.current);
    const plannedItems = navigationItems.filter((item) => !item.current);

    expect(activeItems.map((item) => item.label)).toEqual(["Overview"]);
    expect(plannedItems).toHaveLength(4);
    expect(plannedItems.every((item) => item.status === "Not implemented")).toBe(true);
  });
});
