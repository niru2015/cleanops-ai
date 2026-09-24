import { expect, test } from "@playwright/test";

test("finance showcase picker selects the generated Director and Client emails", async ({ page }) => {
  await page.goto("/login");
  const selector = page.getByRole("combobox", { name: "Demo persona" });
  const email = page.getByRole("textbox", { name: "Email" });

  await selector.selectOption("finance-showcase.darrel-director@cleanops.example.com");
  await expect(email).toHaveValue("finance-showcase.darrel-director@cleanops.example.com");
  await selector.selectOption("finance-showcase.scenario-client@cleanops.example.com");
  await expect(email).toHaveValue("finance-showcase.scenario-client@cleanops.example.com");
});
