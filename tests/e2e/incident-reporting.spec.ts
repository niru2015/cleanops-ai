import { expect, test } from "@playwright/test";

test("supervisor records events, computes the report and releases only its redacted client view", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto("/incidents");
  await expect(page.getByRole("heading", { name: "Incident & equipment desk" })).toBeVisible();
  await page.getByRole("button", { name: "Record reported incident" }).click();
  await expect(page.getByText("Cause not determined.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Worker 182 reported:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Clarify wording & audit" }).click();
  await expect(page.getByText("Wording correction audited")).toBeVisible();
  await page.getByRole("button", { name: "Record scrubber report" }).click();
  await expect(page.getByText("No completed repair claimed")).toBeVisible();
  await expect(page.getByText("reported", { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: "test-results/incidents-equipment-desktop.png", fullPage: true });

  await page.goto("/reports/client");
  await expect(page.getByRole("heading", { name: "No released report" })).toBeVisible();
  await page.goto("/reports");
  await page.getByRole("button", { name: "Prepare computed report" }).click();
  await expect(page.getByText("99.3%")).toBeVisible();
  await expect(page.getByText("149 approved on time / 150 due required runs")).toBeVisible();
  await expect(page.getByText("N/A — scheduled safety checks are not implemented in this prototype.")).toBeVisible();
  await expect(page.getByText("Client access is still closed")).toBeVisible();
  await page.getByRole("button", { name: "Release report to client" }).click();
  await expect(page.getByText("Client access enabled")).toBeVisible();
  await expect(page.getByText("report.released")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reports/client");
  await expect(page.getByRole("heading", { name: "Aurora Downtown Demo" })).toBeVisible();
  await expect(page.getByText("149 / 150 due required task runs · 0 exclusions")).toBeVisible();
  await expect(page.getByText("This client view contains the released redacted snapshot only.", { exact: false })).toBeVisible();
  await expect(page.getByText("I noticed a scratch", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/client-report-mobile.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
