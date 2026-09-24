import { expect, test } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

test("Director finance remains scoped to the selected authorized casino", async ({ page }) => {
  await signInAsDirector(page);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance & inventory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inventory ledger" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Message context review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounting CSV" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
  await expect(page.getByLabel("Combined finance result")).toBeVisible();
  await page.getByRole("combobox", { name: "Casino", exact: true }).selectOption("all");
  await page.getByRole("button", { name: "View finance" }).click();
  await expect(page.getByLabel("Combined finance result")).toBeVisible();
  await expect(page.getByLabel("Combined finance result").getByText("N/A").first()).toBeVisible();

  await page.getByLabel("Choose casino").selectOption("40000000-0000-4000-8000-000000000002");
  await page.getByRole("button", { name: "Open casino" }).click();
  await expect(page).toHaveURL(/siteId=40000000-0000-4000-8000-000000000002/);
  await expect(page.getByText("Copper Peak East Demo").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Message context review" })).toBeVisible();
  await page.getByRole("link", { name: "Time", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Approved time and labour" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Casino", exact: true })).toHaveValue("40000000-0000-4000-8000-000000000002");
});

test("Area Manager sees assigned site summary without confidential worker rates", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_AREA_EMAIL);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Worker cost rates" })).toHaveCount(0);
  await expect(page.getByText("Posted labour").first()).toBeVisible();
  await expect(page.getByText("Individual labour entries are restricted to Directors.", { exact: false })).toBeVisible();
});
