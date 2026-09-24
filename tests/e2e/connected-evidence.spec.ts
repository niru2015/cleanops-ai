import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInAs } from "./auth";

const TASK_ID = "81000000-0000-4000-8000-000000000001";

async function photo(label: string) {
  const svg = `<svg width="320" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="240" fill="#dbe7e4"/><text x="24" y="120" font-size="22">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function upload(page: import("@playwright/test").Page, label: string, role: "before" | "after") {
  await page.waitForLoadState("networkidle");
  await page.locator("#mobile-library-input").setInputFiles({
    name: `${label}.png`, mimeType: "image/png", buffer: await photo(label),
  });
  await page.getByRole("button", { name: `Upload ${role} photo` }).click();
  await expect(page.getByText(`${role === "before" ? "Before" : "After"} photo uploaded and linked to this task.`)).toBeVisible();
}

test("real selected images link to the chosen task and a distinct reviewer approves correction", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);
  await page.goto("/operations");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("The shared synthetic demo has been reset to its starting state.")).toBeVisible();

  await page.goto(`/mobile?taskRunId=${TASK_ID}`);
  await expect(page.getByRole("heading", { name: "Task evidence" })).toBeVisible();
  await upload(page, "before-selected", "before");
  await upload(page, "after-selected", "after");

  await page.goto(`/review?taskRunId=${TASK_ID}`);
  await expect(page.getByRole("heading", { name: "Before and after" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Before evidence for this task" })).toBeVisible();
  await expect(page.getByRole("img", { name: "After evidence for this task" })).toBeVisible();
  await expect.poll(() => page.getByRole("img", { name: "Before evidence for this task" }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const beforeEvidenceId = await page.getByRole("img", { name: "Before evidence for this task" }).getAttribute("data-evidence-id");
  const afterEvidenceId = await page.getByRole("img", { name: "After evidence for this task" }).getAttribute("data-evidence-id");
  expect(beforeEvidenceId && afterEvidenceId).toBeTruthy();
  await page.getByRole("button", { name: "Run Mock AI" }).click();
  await page.getByRole("button", { name: "Confirm and request correction" }).click();
  await expect(page.getByRole("heading", { name: "Re-clean the mirror and submit a corrected AFTER photo." })).toBeVisible();

  await page.goto(`/mobile?taskRunId=${TASK_ID}`);
  await upload(page, "after-corrected-selected", "after");
  await page.goto(`/review?taskRunId=${TASK_ID}`);
  await expect(page.getByText("Revision 2", { exact: false }).first()).toBeVisible();
  expect(await page.getByRole("img", { name: "Before evidence for this task" }).getAttribute("data-evidence-id")).toBe(beforeEvidenceId);
  expect(await page.getByRole("img", { name: "After evidence for this task" }).getAttribute("data-evidence-id")).not.toBe(afterEvidenceId);
  await page.getByRole("button", { name: "Run Mock AI" }).click();
  await page.getByRole("button", { name: "Approve revision 2" }).click();
  await expect(page.getByText("Your role cannot perform this review action.")).toBeVisible();

  const reviewer = await browser.newPage();
  try {
    await signInAs(reviewer, process.env.CLEANOPS_E2E_EMAIL);
    await reviewer.goto(`/review?taskRunId=${TASK_ID}`);
    await reviewer.getByRole("button", { name: "Approve revision 2" }).click();
    await expect(reviewer.getByText("Revision 2 approved")).toBeVisible();
    await reviewer.reload();
    await expect(reviewer.getByRole("img", { name: "After evidence for this task" })).toBeVisible();
  } finally {
    await reviewer.close();
  }

  await page.goto("/mobile?taskRunId=81000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "Task unavailable" })).toBeVisible();
  await page.goto("/review?taskRunId=not-a-task");
  await expect(page.getByRole("heading", { name: "Task not found" })).toBeVisible();

  const client = await browser.newPage();
  try {
    await signInAs(client, process.env.CLEANOPS_E2E_CLIENT_EMAIL);
    const denied = await client.request.get(`/api/evidence/${afterEvidenceId}/signed-url`);
    expect(denied.status()).toBe(404);
  } finally {
    await client.close();
  }
});
