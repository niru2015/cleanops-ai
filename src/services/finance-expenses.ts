import { financeSuggestion, type expenseCategory } from "@/schemas/finance-expenses";
import type { z } from "zod";

type Category = z.infer<typeof expenseCategory>;
const categories: [RegExp, Category][] = [
  [/\b(lunch|meals?|dinner|breakfast|food)\b/i,"meals"],
  [/\b(fuel|gas|petrol|travel|mileage)\b/i,"fuel_travel"],
  [/\b(supplies|cleaning supplies|detergent)\b/i,"supplies"],
  [/\b(equipment purchase|bought equipment|new machine)\b/i,"equipment_purchase"],
  [/\b(repair|maintenance invoice)\b/i,"equipment_repair"],
  [/\b(parking|toll)\b/i,"parking_tolls"],
  [/\b(contractor|subcontractor)\b/i,"contractor"],
];
function amount(text: string, label: string) {
  const match = text.match(new RegExp(`\\b${label}\\s*[:=]\\s*(?:CAD\\s*)?\\$?([\\d,]+(?:\\.\\d{1,2})?)`, "i"));
  return match ? Number(match[1].replaceAll(",", "")) : null;
}
export function suggestFinanceExpense(text: string) {
  const vendor = text.match(/\bvendor\s*[:=]\s*([^;\n]{1,200})/i)?.[1].trim() ?? null;
  const date = text.match(/\bdate\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
  const site = text.match(/\bsite\s*[:=]\s*([^;\n]{1,180})/i)?.[1].trim() ?? null;
  const project = text.match(/\bproject\s*[:=]\s*([^;\n]{1,180})/i)?.[1].trim() ?? null;
  const method = text.match(/\bpayment\s*[:=]\s*(employee personal|company card|company cash|supplier invoice|other)/i)?.[1]
    .toLowerCase().replaceAll(" ", "_") ?? null;
  const total = amount(text,"total") ?? amount(text,"amount");
  const value = { category: categories.find(([pattern]) => pattern.test(text))?.[1] ?? null,
    vendor, expenseDate: date, subtotal: amount(text,"subtotal"), tax: amount(text,"tax"),
    total, currency: /\bUSD\b/i.test(text) ? "USD" : /\bCAD\b|\$/i.test(text) ? "CAD" : null,
    paymentMethod: method, siteHint: site, projectReference: project,
    sourceSpan: text.slice(0,500) };
  return financeSuggestion.parse(value);
}

export function nearDuplicateExpense(a: { vendor: string; expenseDate: string; total: number },
  b: { vendor: string; expenseDate: string; total: number }) {
  return a.vendor.trim().toLowerCase() === b.vendor.trim().toLowerCase() &&
    a.expenseDate === b.expenseDate && Math.abs(a.total-b.total)<=0.01;
}
