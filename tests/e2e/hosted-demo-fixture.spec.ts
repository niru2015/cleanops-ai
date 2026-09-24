import { expect, test } from "@playwright/test";
import { signInAs } from "./auth";

test("production-style supervisor can prepare and reset the synthetic review twice", async ({ page, browser }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);
  for (let pass = 0; pass < 2; pass += 1) {
    await page.goto("/operations");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page.getByText("The shared synthetic demo has been reset to its starting state.")).toBeVisible({ timeout: 30_000 });
    await page.goto("/review");
    await expect(page.getByRole("button", { name: "Prepare submission" })).toBeEnabled();
    await page.getByRole("button", { name: "Prepare submission" }).click();
    await expect(page.getByText("Pending supervisor review")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Before and after" })).toBeVisible();
  }

  if (process.env.CLEANOPS_E2E_PRODUCTION_MODE === "true") {
    const response = await page.request.post("/api/demo/messages", { data: {} });
    expect(response.status()).toBe(404);
  }

  const cleaner = await browser.newPage();
  try {
    await signInAs(cleaner, process.env.CLEANOPS_E2E_CLEANER_EMAIL);
    await cleaner.goto("/review");
    await expect(cleaner.getByRole("heading", { name: "Review access restricted" })).toBeVisible();
  } finally {
    await cleaner.close();
  }

  await page.goto("/operations");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("The shared synthetic demo has been reset to its starting state.")).toBeVisible({ timeout: 30_000 });
});
