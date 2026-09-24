import { expect,test } from "@playwright/test";
import { syntheticReceipt } from "../../src/demo/expense-fixtures.mjs";
import { signInAs,signInAsDirector } from "./auth";

test("worker receipt becomes one Director-approved expense with drill-through",async({page,browser})=>{
  const vendor=`Demo Fuel ${Date.now()}`;
  const date="2026-09-01";
  const item={vendor,date,category:"fuel_travel",cents:4250};
  const bytes=await syntheticReceipt(item,"Aurora Downtown Demo");
  await signInAs(page,process.env.CLEANOPS_E2E_CLEANER_EMAIL);
  await page.goto("/mobile/expenses");
  await expect(page.getByRole("heading",{name:"Submit an expense",level:1})).toBeVisible();
  await page.getByLabel("Expense details").fill(`Expense: fuel; Vendor: ${vendor}; Date: ${date}; Total: CAD $42.50; Payment: employee personal`);
  await page.getByRole("button",{name:"Submit expense"}).click();
  await expect(page.getByText("Expense submitted. Add its receipt before review.")).toBeVisible();
  await page.getByLabel("Receipt file").setInputFiles({name:"fuel.png",mimeType:"image/png",buffer:bytes});
  await page.getByRole("button",{name:"Upload receipt"}).click();
  await expect(page.getByText("Receipt verified for finance review.")).toBeVisible();
  await page.goto("/finance/inbox");
  await expect(page.getByRole("heading",{name:"Finance Inbox unavailable"})).toBeVisible();

  const directorContext=await browser.newContext();
  try{
    const director=await directorContext.newPage();
    await signInAsDirector(director);
    await director.goto("/finance/inbox");
    const candidate=director.locator("article.reviewCard").filter({hasText:vendor}).first();
    await expect(candidate).toBeVisible();
    await expect(candidate.getByRole("link",{name:"Open source receipt"})).toBeVisible();
    await candidate.getByRole("button",{name:"Suggest fields from source"}).click();
    await expect(candidate.getByText(/Machine suggestion:/)).toBeVisible();
    await candidate.getByLabel("Review reason or correction").fill("Receipt and source checked");
    await candidate.getByRole("button",{name:"Save reviewed expense"}).click();
    await expect(candidate.getByText(/Claim submitted · CAD 42.50/)).toBeVisible();
    await director.goto("/finance/expenses");
    const expense=director.locator("article.reviewCard").filter({hasText:vendor}).first();
    await expect(expense.getByText(/Original app message/)).toBeVisible();
    await expect(expense.getByRole("link",{name:"Open original"})).toBeVisible();
    await expense.getByRole("button",{name:"Director approve and post"}).click();
    await expect(expense.getByText(/Director approval:/)).toBeVisible();
    await expect(expense.locator("li").filter({hasText:/fuel travel · CAD 42.50/}).first()).toBeVisible();

    await page.goto("/mobile/expenses");
    await page.getByLabel("Expense details").fill(`Expense: fuel duplicate; Vendor: ${vendor}; Date: ${date}; Total: CAD $42.50`);
    await page.getByRole("button",{name:"Submit expense"}).click();
    await page.getByLabel("Receipt file").setInputFiles({name:"same-fuel.png",mimeType:"image/png",buffer:bytes});
    await page.getByRole("button",{name:"Upload receipt"}).click();
    await expect(page.getByText("Receipt verified for finance review.")).toBeVisible();
    await director.goto("/finance/inbox");
    const duplicate=director.locator("article.reviewCard").filter({hasText:"Expense: fuel duplicate"}).first();
    await expect(duplicate.getByText(/Exact receipt already posted/)).toBeVisible();
  }finally{await directorContext.close();}
});

test("Area Manager resolves assigned-site context but cannot post missing receipt",async({page,browser})=>{
  const vendor=`Demo Cafe ${Date.now()}`;
  await signInAs(page,process.env.CLEANOPS_E2E_AREA_EMAIL);
  await page.goto("/mobile/expenses");
  await expect(page.getByLabel("Casino").locator("option")).toHaveCount(1);
  await page.getByLabel("Expense details").fill(`Expense: lunch; Vendor: ${vendor}; Date: 2026-09-02; Total: CAD $18.00`);
  await page.getByRole("button",{name:"Submit expense"}).click();
  await expect(page.getByText("Expense submitted. Add its receipt before review.")).toBeVisible();
  await page.goto("/finance/inbox");
  const candidate=page.locator("article.reviewCard").filter({hasText:vendor}).first();
  await expect(candidate.getByText(/Receipt missing/)).toBeVisible();
  await candidate.getByRole("button",{name:"Suggest fields from source"}).click();
  await candidate.getByLabel("Payment").selectOption("company_card");
  await candidate.getByLabel("Review reason or correction").fill("Site and amount checked");
  await candidate.getByRole("button",{name:"Save reviewed expense"}).click();
  await page.goto("/finance/expenses");
  const expense=page.locator("article.reviewCard").filter({hasText:vendor}).first();
  await expect(expense.getByRole("button",{name:"Director approve and post"})).toHaveCount(0);
  const directorContext=await browser.newContext();
  try{
    const director=await directorContext.newPage();
    await signInAsDirector(director);
    await director.goto("/finance/expenses");
    const pending=director.locator("article.reviewCard").filter({hasText:vendor}).first();
    await pending.getByRole("button",{name:"Director approve and post"}).click();
    await expect(pending.getByText("Verified receipt required")).toBeVisible();
  }finally{await directorContext.close();}
});
