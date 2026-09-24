import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { accounts, capture, signIn, visit } from "./flows";

test.describe("Tornado synthetic demo recording", () => {
  test("UAT-00 Public recorder smoke", async ({ page }) => {
    await test.step("Capture the synthetic login without credentials", async () => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Explore the BC casino operations demo" })).toBeVisible();
      await expect(page.getByText("Prototype · synthetic data")).toBeVisible();
      await capture(page, "00-public-recorder-smoke");
    });
  });

  test("UAT-01 Authentication", async ({ page }) => {
    await test.step("Show the synthetic demo login", async () => {
      await page.goto("/login");
      await expect(page.getByText("Prototype · synthetic data")).toBeVisible();
      await capture(page, "01-authentication-login");
    });
    await test.step("Sign in as the generated Director", async () => {
      await signIn(page, accounts.director);
      await capture(page, "01-authentication-signed-in");
    });
  });

  test("UAT-02 Director Dashboard", async ({ page }) => {
    await signIn(page, accounts.director);
    await test.step("Show source-backed site finance overview", async () => {
      await visit(page, "/finance?month=2026-08", "Finance & inventory");
      await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
      await capture(page, "02-director-dashboard");
    });
  });

  test("UAT-03 Casino Operations", async ({ page }) => {
    await signIn(page, accounts.showcaseSupervisor);
    await test.step("Show the generated Supervisor's assigned casino portfolio", async () => {
      await visit(page, "/operations", "Assigned casinos");
      await capture(page, "03-casino-operations");
    });
  });

  test("UAT-04 Workforce", async ({ page }) => {
    await signIn(page, accounts.director);
    await test.step("Show generated time and labour review without posting cost", async () => {
      await visit(page, "/finance/time", "Approved time and labour");
      await expect(page.getByRole("heading", { name: "Time review" })).toBeVisible();
      await capture(page, "04-workforce-time-review");
    });
  });

  test("UAT-05 Cleaning evidence review", async ({ page }) => {
    test.skip(!process.env.TORNADO_OPERATIONS_PASSWORD, "The separate legacy operations password is required for cleaning evidence.");
    await signIn(page, accounts.legacySupervisor, process.env.TORNADO_OPERATIONS_PASSWORD);
    await test.step("Show the seeded cleaning evidence review", async () => {
      await visit(page, "/review", "Evidence review");
      await expect(page.getByRole("heading", { name: /Prepare the synthetic evidence pair|Before and after/ }).first()).toBeVisible();
      await capture(page, "05-cleaning-evidence");
    });
  });

  test("UAT-05B Mobile cleaning evidence result", async ({ page }) => {
    test.skip(!process.env.TORNADO_OPERATIONS_PASSWORD, "The separate legacy operations password is required for the mobile task fixture.");
    await signIn(page, accounts.legacyDirector, process.env.TORNADO_OPERATIONS_PASSWORD);
    await test.step("Show the supported mobile task and any linked evidence", async () => {
      await visit(page, "/mobile", "My tasks");
      await expect(page.getByRole("heading", { name: "Slot Bank 14 detail clean" })).toBeVisible();
      if (process.env.TORNADO_EXPECT_MOBILE_EVIDENCE === "1") {
        await expect(page.getByText("Submission ready for review")).toBeVisible();
      }
      await capture(page, "05-mobile-evidence-result");
    });
  });

  test("UAT-05A WhatsApp finance source", async ({ page }) => {
    await signIn(page, accounts.director);
    await test.step("Show synthetic WhatsApp candidate and receipt context", async () => {
      await visit(page, "/finance/inbox", "Finance Inbox");
      await expect(page.getByRole("heading", { name: /WhatsApp candidate/ }).first()).toBeVisible();
      await capture(page, "05-whatsapp-finance-source");
    });
  });

  test("UAT-06 Equipment", async ({ page }) => {
    await signIn(page, accounts.showcaseSupervisor);
    await test.step("Show the site-scoped equipment register", async () => {
      await visit(page, "/operations", "Assigned casinos");
      await expect(page.getByText("Equipment register", { exact: true }).first()).toBeVisible();
      await capture(page, "06-equipment-register");
    });
  });

  test("UAT-06A Equipment issue report", async ({ page }) => {
    test.skip(!process.env.TORNADO_OPERATIONS_PASSWORD, "The separate legacy operations password is required for the issue-report fixture.");
    await signIn(page, accounts.legacySupervisor, process.env.TORNADO_OPERATIONS_PASSWORD);
    await visit(page, "/incidents", "Incident & equipment desk");
    await expect(page.getByRole("heading", { name: "Equipment intake" })).toBeVisible();
    await capture(page, "06-equipment-report");
  });

  test("UAT-07 Incidents", async ({ page }) => {
    test.skip(!process.env.TORNADO_OPERATIONS_PASSWORD, "The separate legacy operations password is required for the incident fixture.");
    await signIn(page, accounts.legacySupervisor, process.env.TORNADO_OPERATIONS_PASSWORD);
    await test.step("Show attributed incident and undetermined cause", async () => {
      await visit(page, "/incidents", "Incident & equipment desk");
      await expect(page.getByRole("heading", { name: "Reported scratch" })).toBeVisible();
      await expect(page.getByText("Cause undetermined")).toBeVisible();
      await capture(page, "07-incident-desk");
    });
  });

  test("UAT-08 Finance and RBAC", async ({ browser }) => {
    const director = await browser.newPage();
    const supervisor = await browser.newPage();
    try {
      await test.step("Director sees finance sources", async () => {
        await signIn(director, accounts.director);
        await visit(director, "/finance/inbox", "Finance Inbox");
        await capture(director, "08-finance-inbox");
        await visit(director, "/finance/reconciliation", "Accounting reconciliation and period close");
        await capture(director, "08-finance-reconciliation");
      });
      await test.step("Finance-showcase Supervisor is denied finance", async () => {
        await signIn(supervisor, accounts.showcaseSupervisor);
        await supervisor.goto("/finance");
        await expect(supervisor.getByRole("heading", { name: "Finance access restricted" })).toBeVisible();
        await capture(supervisor, "08-rbac-supervisor-denied");
      });
    } finally { await director.close(); await supervisor.close(); }
  });

  test("UAT-09 Scenario Generator", async ({ page }) => {
    const path = process.env.TORNADO_EXPECTED_MANIFEST;
    test.skip(!path, "Set TORNADO_EXPECTED_MANIFEST to verify the active generated scenario.");
    const expected = JSON.parse(await readFile(path!, "utf8")) as { scenarioId: string; controlTotals: { siteCount: number } };
    expect(expected.scenarioId).toBe("finance-showcase");
    await signIn(page, accounts.director);
    await test.step("Compare visible scenario site count with expected manifest", async () => {
      await visit(page, "/finance?month=2026-08", "Finance & inventory");
      await expect(page.locator(".financeSummarySites > article")).toHaveCount(expected.controlTotals.siteCount);
      await capture(page, "09-generated-scenario");
    });
  });

  test("UAT-10 Existing AI functionality", async ({ page }) => {
    test.skip(!process.env.TORNADO_OPERATIONS_PASSWORD, "The separate legacy operations password is required for Mock AI evidence review.");
    await signIn(page, accounts.legacySupervisor, process.env.TORNADO_OPERATIONS_PASSWORD);
    await test.step("Show labelled Mock AI decision support", async () => {
      await visit(page, "/review", "Evidence review");
      if (await page.getByRole("heading", { name: "Prepare the synthetic evidence pair" }).isVisible()) {
        await capture(page, "10-mock-ai-not-yet-available");
        test.skip(true, "The hosted Restroom B pair is absent; its preparation action is unavailable on this deployment. Slot Bank 14 mobile evidence is a separate task.");
      }
      await expect(page.getByText("Mock AI", { exact: true })).toBeVisible();
      await capture(page, "10-mock-ai-review");
    });
  });
});
