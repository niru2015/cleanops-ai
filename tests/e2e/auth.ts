import type { Page } from "@playwright/test";

export async function signInAsDirector(page: Page) {
  await signInAs(page, process.env.CLEANOPS_E2E_EMAIL);
}

export async function signInAs(page: Page, email: string | undefined) {
  const password = process.env.CLEANOPS_DEMO_PASSWORD;
  if (!email || !password) throw new Error("The authenticated browser-test credentials are required.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Demo password").fill(password);
  await page.getByRole("button", { name: "Open demo workspace" }).click();
  await page.waitForURL("**/operations");
}
