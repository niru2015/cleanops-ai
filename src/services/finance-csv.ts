export const FINANCE_MAPPING_VERSION = "cleanops-neutral-v1";

const categories = ["revenue", "direct_labour", "supplies", "repairs", "other_direct_cost", "overhead", "depreciation", "tax"] as const;
const requiredHeaders = ["source_document_id", "source_line_id", "site_reference", "service_period", "accounting_period", "currency", "category", "amount"] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const enumValue = <T extends readonly string[]>(values: T, fallback: T[number]) =>
  (value: string): T[number] => values.includes(value as T[number]) ? value as T[number] : fallback;

function parseRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { record.push(field); field = ""; }
    else if (char === "\n") { record.push(field); records.push(record); record = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  if (field.length || record.length) { record.push(field); records.push(record); }
  return records.filter((entry) => entry.some((value) => value.trim().length));
}

export type FinanceImportRow = {
  source_row_number: number;
  source_account_id: string;
  source_document_id: string;
  source_line_id: string;
  site_reference: string;
  site_id: string;
  contract_reference: string;
  job_reference: string;
  asset_reference: string;
  operational_reference_type: string;
  operational_reference_id: string;
  service_period: string;
  accounting_period: string;
  currency: string;
  category: typeof categories[number] | "unmapped";
  amount: string;
  tax_amount: string;
  tax_treatment: "exclusive" | "inclusive" | "exempt" | "unknown";
  approval_state: "pending" | "approved" | "rejected";
  recognition_state: "actual" | "estimate" | "committed";
  supersedes_source_row_id: string;
};

export type FinanceImportPreview = {
  rows: FinanceImportRow[];
  errors: string[];
  warnings: string[];
  totals: { revenue: number; directCost: number; directContribution: number };
  periodStart: string;
  periodEnd: string;
  currency: string;
};

export function parseFinanceCsv(csv: string, sites: { id: string; name: string }[]): FinanceImportPreview {
  if (csv.length > 2_000_000) throw new Error("The CSV exceeds the 2 MB import limit.");
  const records = parseRecords(csv);
  if (records.length < 2) throw new Error("The CSV needs a header and at least one data row.");
  if (records.length > 5001) throw new Error("The CSV exceeds the 5,000 row import limit.");
  const headers = records[0].map((value) => value.trim().toLowerCase().replace(/^\ufeff/, ""));
  const errors = requiredHeaders.filter((header) => !headers.includes(header)).map((header) => `Missing required column: ${header}.`);
  if (errors.length) return { rows: [], errors, warnings: [], totals: { revenue: 0, directCost: 0, directContribution: 0 }, periodStart: "", periodEnd: "", currency: "" };
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const warnings: string[] = [];
  const seen = new Set<string>();
  const siteMap = new Map<string, string>();
  for (const site of sites) { siteMap.set(site.id.toLowerCase(), site.id); siteMap.set(site.name.trim().toLowerCase(), site.id); }
  const value = (record: string[], name: string) => (record[index[name]] ?? "").trim();
  const rows = records.slice(1).map((record, offset): FinanceImportRow => {
    const line = offset + 2;
    const documentId = value(record, "source_document_id");
    const lineId = value(record, "source_line_id");
    const key = `${documentId}\u0000${lineId}`;
    if (!documentId || !lineId) errors.push(`Row ${line}: source document and line IDs are required.`);
    if (seen.has(key)) errors.push(`Row ${line}: duplicate source document and line ID.`); else seen.add(key);
    const servicePeriod = value(record, "service_period");
    const accountingPeriod = value(record, "accounting_period");
    if (!datePattern.test(servicePeriod) || !datePattern.test(accountingPeriod)) errors.push(`Row ${line}: periods must use YYYY-MM-DD.`);
    const currency = value(record, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) errors.push(`Row ${line}: currency must be a three-letter code.`);
    const rawAmount = value(record, "amount");
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount === 0 || !/^-?\d+(\.\d{1,2})?$/.test(rawAmount)) errors.push(`Row ${line}: amount must be a non-zero value with at most two decimals.`);
    const rawTax = value(record, "tax_amount") || "0";
    const tax = Number(rawTax);
    if (!Number.isFinite(tax) || !/^-?\d+(\.\d{1,2})?$/.test(rawTax)) errors.push(`Row ${line}: tax_amount must have at most two decimals.`);
    const rawCategory = value(record, "category").toLowerCase();
    const category = categories.includes(rawCategory as typeof categories[number]) ? rawCategory as typeof categories[number] : "unmapped";
    const siteReference = value(record, "site_reference");
    const siteId = siteMap.get(siteReference.toLowerCase()) ?? "";
    if (!siteId) warnings.push(`Row ${line}: site '${siteReference || "(blank)"}' is unallocated.`);
    if (category === "unmapped") warnings.push(`Row ${line}: category '${rawCategory || "(blank)"}' is unmapped.`);
    const approval = value(record, "approval_state").toLowerCase();
    const recognition = value(record, "recognition_state").toLowerCase();
    return {
      source_row_number: line, source_account_id: value(record, "source_account_id"), source_document_id: documentId,
      source_line_id: lineId, site_reference: siteReference, site_id: siteId, contract_reference: value(record, "contract_reference"),
      job_reference: value(record, "job_reference"), asset_reference: value(record, "asset_reference"),
      operational_reference_type: value(record, "operational_reference_type"), operational_reference_id: value(record, "operational_reference_id"),
      service_period: servicePeriod, accounting_period: accountingPeriod, currency, category, amount: Number.isFinite(amount) ? amount.toFixed(2) : rawAmount,
      tax_amount: Number.isFinite(tax) ? tax.toFixed(2) : rawTax,
      tax_treatment: enumValue(["exclusive", "inclusive", "exempt", "unknown"] as const, "unknown")(value(record, "tax_treatment").toLowerCase()),
      approval_state: enumValue(["pending", "approved", "rejected"] as const, "pending")(approval),
      recognition_state: enumValue(["actual", "estimate", "committed"] as const, "estimate")(recognition),
      supersedes_source_row_id: value(record, "supersedes_source_row_id"),
    };
  });
  const currencies = [...new Set(rows.map((row) => row.currency))];
  if (currencies.length !== 1) errors.push("Every row in an import must use the same currency.");
  const recognized = rows.filter((row) => row.site_id && row.category !== "unmapped" && row.approval_state === "approved" && row.recognition_state === "actual");
  const revenue = recognized.filter((row) => row.category === "revenue").reduce((sum, row) => sum + Number(row.amount), 0);
  const directCost = recognized.filter((row) => ["direct_labour", "supplies", "repairs", "other_direct_cost"].includes(row.category)).reduce((sum, row) => sum + Number(row.amount), 0);
  const periods = rows.map((row) => row.service_period).filter((period) => datePattern.test(period)).sort();
  return { rows, errors, warnings, totals: { revenue, directCost, directContribution: revenue - directCost }, periodStart: periods[0] ?? "", periodEnd: periods.at(-1) ?? "", currency: currencies.length === 1 ? currencies[0] : "" };
}
