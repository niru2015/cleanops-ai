import { expect, test } from "@playwright/test";

test("supervisor closes the staffing gap from attendance records", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/operations");
  await expect(page).toHaveTitle("CleanOps");
  await expect(page.getByRole("heading", { name: "Operations command" })).toBeVisible();
  await expect(page.getByText("40 / 42")).toBeVisible();
  await expect(page.getByText("2 position gap")).toBeVisible();

  const firstCandidate = page.getByText("Replacement candidate 1 Demo").locator("..").locator("..");
  await firstCandidate.getByRole("button", { name: "Select & assign" }).click();
  await expect(page.getByText("Assigned · awaiting check-in").first()).toBeVisible();
  await expect(page.getByText("40 / 42")).toBeVisible();
  await firstCandidate.getByRole("button", { name: "Record check-in" }).click();
  await expect(page.getByText("41 / 42")).toBeVisible();

  const secondCandidate = page.getByText("Replacement candidate 2 Demo").locator("..").locator("..");
  await secondCandidate.getByRole("button", { name: "Select & assign" }).click();
  await secondCandidate.getByRole("button", { name: "Record check-in" }).click();
  await expect(page.getByText("42 / 42")).toBeVisible();
  await expect(page.getByText("Covered", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/operations-covered-desktop.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test("cleaner selects QR context and recovers from a failed upload", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mobile");
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Slot Bank 14 detail clean" })).toBeVisible();
  await page.getByRole("button", { name: "Scan Slot Bank 14 code" }).click();
  await expect(page.getByText(/does not record attendance or prove identity/)).toBeVisible();

  await page.getByRole("button", { name: "Simulate upload failure" }).click();
  await expect(page.getByText("Upload failed before recording. Your task is unchanged; retry when ready.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture before photo" })).toBeVisible();
  await page.getByRole("button", { name: "Capture before photo" }).click();
  await expect(page.getByText("Uploaded and linked").first()).toBeVisible();
  await page.getByRole("button", { name: "Capture after photo" }).click();
  await expect(page.getByText("Submission ready for review")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-submission-complete.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
