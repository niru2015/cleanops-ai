import { expect, test } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

test("equipment care keeps inspection, fault, work and return approval separate", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAsDirector(page);
  await page.goto("/equipment");
  await expect(page.getByRole("heading", { name: "Asset register" })).toBeVisible();
  await page.getByRole("link", { name: /EQ-/ }).first().click();
  await expect(page.getByText("No post-use inspection recorded.")).toBeVisible();
  await expect(page.getByText(/No approved checklist version/)).toBeVisible();

  const checklist = page.locator("form").filter({ has: page.getByRole("heading", { name: "Approve source-backed checklist version" }) });
  await checklist.locator('select[name="sourceKind"]').selectOption("customer_approved");
  await checklist.getByLabel("Document/reference").fill("Synthetic customer-approved browser test TEST-CARE-3");
  await checklist.getByLabel("Source instructions, one per line").fill("Record visible condition");
  await checklist.getByRole("button", { name: "Approve checklist version" }).click();
  await expect(page.getByText("Checklist version approved", { exact: true })).toBeVisible();

  const inspection = page.locator("form").filter({ has: page.getByRole("heading", { name: "Record post-use inspection" }) });
  await inspection.getByLabel("Outcome").selectOption("follow_up_required");
  await inspection.getByLabel("Record visible condition").selectOption("follow_up_required");
  await inspection.getByLabel("Notes").fill("Neutral observed follow-up");
  await inspection.getByRole("button", { name: "Save inspection" }).click();
  await expect(page.getByText("Inspection recorded", { exact: true })).toBeVisible();
  await expect(page.getByText("Follow-up is open.")).toBeVisible();

  const fault = page.locator("form").filter({ has: page.getByRole("heading", { name: "Report a neutral fault" }) });
  await fault.getByLabel("Observed issue").fill("Scrubber pulling right; cause unknown");
  await fault.getByRole("button", { name: "Record fault" }).click();
  await expect(page.getByText("Neutral fault report recorded", { exact: true })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "Scrubber pulling right; cause unknown" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/equipment-fault-open.png", fullPage: true });

  const maintenance = page.locator('form:has(select[name="actionKind"])');
  for (const [kind, notes] of [
    ["triaged", "Neutral fault reviewed"],
    ["maintenance_requested", "Maintenance review requested"],
    ["work_completed", "Synthetic test work completed with source notes"],
  ]) {
    await maintenance.locator('select[name="actionKind"]').selectOption(kind);
    await maintenance.locator('textarea[name="notes"]').fill(notes);
    await maintenance.getByRole("button", { name: "Save event" }).click();
    await expect(page.getByText("Maintenance history recorded", { exact: true })).toBeVisible();
    await expect(page.locator("li").filter({ hasText: notes }).first()).toBeVisible();
  }
  await maintenance.locator('select[name="actionKind"]').selectOption("return_to_service");
  await maintenance.locator('textarea[name="notes"]').fill("Attempt own return approval");
  await maintenance.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByText(/return-to-service approver must differ/)).toBeVisible();

  const assetUrl = page.url();
  await page.context().clearCookies();
  await signInAs(page, process.env.CLEANOPS_E2E_OPERATIONS_EMAIL);
  await page.goto(assetUrl);
  const approval = page.locator('form:has(select[name="actionKind"])');
  await approval.locator('select[name="actionKind"]').selectOption("return_to_service");
  await approval.locator('textarea[name="notes"]').fill("Independent return-to-service approval");
  await approval.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByText("Maintenance history recorded", { exact: true })).toBeVisible();
  await expect(page.getByText(/Status:/)).toContainText("available");
  await page.screenshot({ path: "test-results/equipment-return-approved.png", fullPage: true });
});
