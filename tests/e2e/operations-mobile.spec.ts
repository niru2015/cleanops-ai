import { expect, test } from "@playwright/test";
import { signInAsDirector } from "./auth";

test("supervisor closes the staffing gap from attendance records", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await signInAsDirector(page);
  await page.goto("/operations");
  await expect(page).toHaveTitle("CleanOps");
  await expect(page.getByRole("heading", { name: "Assigned casinos" })).toBeVisible();
  await expect(page.getByText("equipment assets", { exact: true })).toBeVisible();
  await expect(page.getByText("Ride-on floor scrubber").first()).toBeVisible();
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

test("cleaner selects QR context and uploads real before and after images", async ({ page }) => {
  const consoleErrors: string[] = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await signInAsDirector(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mobile");
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Slot Bank 14 detail clean" })).toBeVisible();
  await page.getByRole("button", { name: "Scan Slot Bank 14 code" }).click();
  await expect(page.getByText(/does not record attendance or prove identity/)).toBeVisible();
  await expect(page.getByLabel("Take before photo")).toHaveAttribute("capture", "environment");
  await expect(page.getByLabel("Choose before photo from library")).not.toHaveAttribute("capture");

  await page.getByLabel("Choose before photo from library").setInputFiles({ name: "before.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Selected before evidence preview")).toBeVisible();
  await page.getByRole("button", { name: "Upload before photo" }).click();
  await expect(page.getByText("Uploaded and linked").first()).toBeVisible();

  await page.getByLabel("Choose after photo from library").setInputFiles({ name: "after.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Selected after evidence preview")).toBeVisible();
  await page.getByRole("button", { name: "Upload after photo" }).click();
  await expect(page.getByText("Submission ready for review")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-submission-complete.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
