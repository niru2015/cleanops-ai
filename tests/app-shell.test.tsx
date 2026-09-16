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
    expect(html).toContain("Open Evidence review");
    expect(html).not.toContain("AI verified");
  });

  it("exposes Overview and Evidence review while labeling planned destinations", () => {
    const implementedItems = navigationItems.filter((item) => item.implemented);
    const plannedItems = navigationItems.filter((item) => !item.implemented);

    expect(implementedItems.map((item) => item.label)).toEqual(["Overview", "Evidence review"]);
    expect(plannedItems).toHaveLength(3);
    expect(plannedItems.every((item) => "status" in item && item.status === "Not implemented")).toBe(true);
  });
});
