import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const accounts = {
  director: process.env.TORNADO_FINANCE_DIRECTOR_EMAIL ?? "finance-showcase.darrel-director@cleanops.example.com",
  area: process.env.TORNADO_FINANCE_AREA_EMAIL ?? "finance-showcase.shayana-area@cleanops.example.com",
  showcaseSupervisor: process.env.TORNADO_FINANCE_SUPERVISOR_EMAIL ?? "finance-showcase.hardeep@cleanops.example.com",
  legacySupervisor: process.env.TORNADO_OPERATIONS_SUPERVISOR_EMAIL ?? "hardeep.supervisor@cleanops.example.com",
  legacyDirector: process.env.TORNADO_OPERATIONS_DIRECTOR_EMAIL ?? "darrel.director@cleanops.example.com",
} as const;

export async function capture(page: Page, name: string) {
  const folder = join(process.cwd(), "artifacts/tornado-demo/screenshots");
  await mkdir(folder, { recursive: true });
  const path = join(folder, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await test.info().attach(name, { path, contentType: "image/png" });
}

export async function signIn(page: Page, email: string, password = process.env.TORNADO_DEMO_PASSWORD) {
  if (!password) throw new Error("TORNADO_DEMO_PASSWORD is required. See TORNADO_DEMO.md.");
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Explore the BC casino operations demo" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Demo password").fill(password);
  await page.getByRole("button", { name: "Open demo workspace" }).click();
  await expect(page).toHaveURL(/\/(operations|mobile)(?:\?.*)?$/);
  await expect(page.getByRole("status", { name: /Prototype/i }).or(page.locator(".prototypeBanner"))).toBeVisible();
}

export async function visit(page: Page, path: string, heading: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} must respond successfully`).toBeTruthy();
  await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sign in required|access restricted|unavailable|No casino assignment/i })).toHaveCount(0);
}
