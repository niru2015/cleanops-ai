import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { signInAs, signInAsDirector } from "./auth";

test("Director activates a one-off project while Area Manager remains site-scoped", async ({ browser }) => {
  const code = `E2E-${Date.now()}`;
  const director = await browser.newPage();
  let projectId: string | undefined;
  try {
    await signInAsDirector(director);
    await director.goto("/finance/projects");
    await expect(director.getByRole("heading", { name: "One-off project profitability" })).toBeVisible();
    await director.getByLabel("Casino").first().selectOption("40000000-0000-4000-8000-000000000001");
    await director.getByLabel("Project code").fill(code);
    await director.getByLabel("Name", { exact: true }).fill("Synthetic browser deep clean");
    await director.getByLabel("Scope").fill("Synthetic one-off clean for browser verification");
    await director.getByRole("button", { name: "Create draft" }).click();
    const card = director.locator("article.reviewCard").filter({ hasText: code });
    await expect(card).toBeVisible();
    await card.getByLabel("Quote or hourly rate").fill("500");
    await card.getByRole("button", { name: "Approve terms and activate" }).click();
    await expect(card.getByText("$500.00").first()).toBeVisible();
    await expect(card.getByText("Pending complete accounting and cost close")).toBeVisible();

    const area = await browser.newPage();
    try {
      await signInAs(area, process.env.CLEANOPS_E2E_AREA_EMAIL);
      await area.goto("/finance/projects");
      await expect(area.getByRole("heading", { name: "One-off project profitability" })).toBeVisible();
      await expect(area.getByText(code)).toHaveCount(0);
      await expect(area.getByRole("button", { name: "Approve terms and activate" })).toHaveCount(0);
    } finally { await area.close(); }
  } finally {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (url && key) {
      const admin = createClient(url, key, { auth: { persistSession: false } });
      const row = await admin.from("projects").select("id").eq("project_code", code).maybeSingle();
      projectId = row.data?.id;
      if (projectId) {
        await admin.from("project_revenue_terms").delete().eq("project_id", projectId);
        await admin.from("projects").delete().eq("id", projectId);
      }
    }
    await director.close();
  }
});
