import { describe,it,expect } from "vitest";
import { suggestFinanceExpense,nearDuplicateExpense } from "@/services/finance-expenses";

describe("deterministic expense suggestions",()=>{
  it("extracts fuel and meal values while keeping unknown tax unknown",()=>{
    const fuel=suggestFinanceExpense("Expense: fuel; Vendor: Demo Fuel; Date: 2026-09-01; Total: CAD $42.00; Payment: employee personal");
    expect(fuel).toMatchObject({category:"fuel_travel",vendor:"Demo Fuel",expenseDate:"2026-09-01",
      total:42,currency:"CAD",tax:null,paymentMethod:"employee_personal"});
    const meal=suggestFinanceExpense("Lunch receipt; Vendor: Demo Cafe; Date: 2026-09-02; Subtotal: $10; Tax: $1.20; Total: $11.20");
    expect(meal).toMatchObject({category:"meals",subtotal:10,tax:1.2,total:11.2});
  });
  it("flags equipment purchases and leaves unsupported fields unresolved",()=>{
    const value=suggestFinanceExpense("Equipment purchase. Worker claims hourly rate $99. Project: test job");
    expect(value.category).toBe("equipment_purchase");
    expect(value.vendor).toBeNull();
    expect(value.total).toBeNull();
    expect(value.tax).toBeNull();
    expect(value.paymentMethod).toBeNull();
  });
  it("uses vendor date and amount only as a near-duplicate signal",()=>{
    const a={vendor:"Demo Fuel",expenseDate:"2026-09-01",total:42};
    expect(nearDuplicateExpense(a,{vendor:"demo fuel",expenseDate:"2026-09-01",total:42})).toBe(true);
    expect(nearDuplicateExpense(a,{vendor:"Demo Fuel",expenseDate:"2026-09-02",total:42})).toBe(false);
  });
});
