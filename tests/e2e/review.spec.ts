import { expect, test } from "@playwright/test";
import { signInAsDirector } from "./auth";

test("submit, review, correct, approve, and retain the latest revision", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await signInAsDirector(page);

  await page.goto("/review");
  await expect(page).toHaveTitle("CleanOps");
  await expect(page.getByRole("heading", { name: "Evidence review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prepare the synthetic evidence pair" })).toBeVisible();

  await page.getByRole("button", { name: "Prepare submission" }).click();
  await expect(page.getByText("Pending supervisor review")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before and after" })).toBeVisible();

  await page.getByRole("button", { name: "Run Mock AI" }).click();
  await expect(page.getByText("86", { exact: true })).toBeVisible();
  await expect(page.getByText("Mock AI", { exact: true })).toBeVisible();
  await expect(page.getByText(/Possible streak remains/)).toBeVisible();

  await page.getByRole("button", { name: "Confirm and request correction" }).click();
  await expect(page.getByText("Correction required", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Re-clean the mirror/ })).toBeVisible();

  await page.getByRole("button", { name: "Use labelled synthetic sample" }).click();
  await expect(page.getByText("Correction revision 2 was submitted at 23:34.")).toBeVisible();
  await expect(page.getByText(/Revision 2/).first()).toBeVisible();

  await page.getByRole("button", { name: "Run Mock AI" }).click();
  await expect(page.getByText("96", { exact: true })).toBeVisible();
  await expect(page.getByText("Score 96 still requires your approval.")).toBeVisible();
  await page.getByRole("button", { name: "Approve revision 2" }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Revision 2 approved")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Revision 2 approved")).toBeVisible();
  await expect(page.getByText("Supervisor approved submission")).toBeVisible();
  await page.screenshot({ path: "test-results/review-approved-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText("Revision 2 approved")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/review-approved-mobile.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
