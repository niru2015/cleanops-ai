import { expect, test } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

test("Director can reach finance, set a rate, approve project hours, and post once", async ({ page }) => {
  const project = `Synthetic browser job ${Date.now()}`;
  await signInAsDirector(page);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance & inventory" })).toBeVisible();
  await page.goto("/finance/rates");
  await expect(page.getByRole("heading", { name: "Worker cost rates" })).toBeVisible();
  await page.getByRole("combobox", { name: "Worker" }).selectOption("60000000-0000-4000-8000-000000000001");
  await page.getByLabel("Hourly cost CAD").fill("25.1250");
  await page.getByLabel("Effective from").fill("2026-01-01");
  await page.getByLabel("Reason").fill("Browser test rate source");
  await page.getByRole("button", { name: "Save rate" }).click();
  await expect(page.getByText("Effective worker cost rate saved with audit history.")).toBeVisible();

  await page.getByRole("link", { name: "Time review" }).click();
  await expect(page.getByRole("heading", { name: "Approved time and labour" })).toBeVisible();
  await page.getByRole("heading", { name: "Manual project time" }).locator("..").getByLabel("Worker").selectOption("60000000-0000-4000-8000-000000000001");
  await page.getByLabel("Project reference").fill(project);
  await page.getByLabel("Work date").fill("2026-09-15");
  await page.getByLabel("Hours", { exact: true }).fill("2");
  await page.getByRole("heading", { name: "Manual project time" }).locator("..").getByLabel("Reason").fill("Browser job source checked");
  await page.getByRole("button", { name: "Create draft time" }).click();
  await expect(page.getByText(project)).toBeVisible();
  const card = page.locator("article.reviewCard").filter({ hasText: project });
  await card.getByLabel("Reason").fill("Approved browser job hours");
  await card.getByRole("button", { name: "Approve hours" }).click();
  await expect(card.getByRole("button", { name: "Post approved cost" })).toBeVisible();
  await card.getByRole("button", { name: "Post approved cost" }).click();
  await expect(card.getByText(/Cost posted once/)).toBeVisible();
});

test("Area Manager sees site time without confidential rate controls", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_AREA_EMAIL);
  const timeResponse = await page.goto("/finance/time");
  await expect(page.getByRole("heading", { name: "Approved time and labour" })).toBeVisible();
  expect(await timeResponse?.text()).not.toContain("25.125");
  await expect(page.getByRole("combobox", { name: "Casino" })).toHaveValue("40000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("link", { name: "Worker cost rates" })).toHaveCount(0);
  await page.goto("/finance/rates");
  await expect(page.getByText("Confidential Director access is required.")).toBeVisible();
  await expect(page.getByText("Hourly cost CAD")).toHaveCount(0);
});

test("Supervisor resolves missing checkout without seeing a worker rate", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);
  await page.goto("/finance/time");
  await expect(page.getByRole("heading", { name: "Approved time and labour" })).toBeVisible();
  await page.getByRole("combobox", { name: "Shift assignment" })
    .selectOption("a2000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Check attendance" }).click();
  const card = page.locator("article.reviewCard").filter({ hasText: "Night team 01 Demo" });
  await expect(card.getByText(/missing checkout/i)).toBeVisible();
  await card.getByLabel("Approved hours").fill("7.5");
  await card.getByLabel("Reason").fill("Supervisor checked paper log");
  await card.getByRole("button", { name: "Approve hours" }).click();
  await expect(card.getByText(/approved/i).first()).toBeVisible();
  await card.getByText("Time audit").click();
  await expect(card.locator("details").getByText("Supervisor checked paper log")).toBeVisible();
  await expect(card.getByRole("button", { name: "Post approved cost" })).toHaveCount(0);
  await expect(page.getByText("Hourly cost CAD")).toHaveCount(0);
});
