import "server-only";

import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import english from "@tesseract.js-data/eng";
import { contractExtractionResultSchema, type ContractExtractionResult,
  type ContractProposal } from "@/schemas/contract-extraction";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 20;
const MAX_OCR_PAGES = 4;
const MAX_PAGE_CHARS = 12_000;
type SourcePage = { page: number | null; text: string };
type FieldKey = ContractProposal["fieldKey"];
type Category = ContractProposal["category"];

export interface ContractExtractionProvider {
  name: string;
  version: string;
  extract(pages: SourcePage[]): Promise<unknown>;
}

export function detectContractMime(bytes: Uint8Array) {
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-") return "application/pdf";
  if (bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).toString() === "PK\u0003\u0004")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP") return "image/webp";
  return null;
}

async function ocrImage(bytes: Uint8Array) {
  const image = sharp(Buffer.from(bytes), { limitInputPixels: 36_000_000 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000)
    throw new Error("Scanned page dimensions exceed the extraction limit.");
  const png = await image.resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const worker = await createWorker("eng", 1, { cacheMethod: "none", langPath: english.langPath });
  try {
    const result = await worker.recognize(png);
    return result.data.text.slice(0, MAX_PAGE_CHARS);
  } finally {
    await worker.terminate();
  }
}

export async function readContractPages(bytes: Uint8Array, mime: string): Promise<SourcePage[]> {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Contract file exceeds the 15 MB limit.");
  if (detectContractMime(bytes) !== mime) throw new Error("Contract contents do not match the declared file type.");
  if (mime === "application/pdf") {
    const task = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true });
    try {
      const document = await task.promise;
      if (document.numPages < 1 || document.numPages > MAX_PAGES) throw new Error("PDF exceeds the 20 page limit.");
      const pages: SourcePage[] = [];
      let ocrCount = 0;
      for (let index = 1; index <= document.numPages; index += 1) {
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        let text = content.items.map((item) => "str" in item ? item.str : "").join(" ").slice(0, MAX_PAGE_CHARS);
        if (text.trim().length < 20 && ocrCount < MAX_OCR_PAGES) {
          const viewport = page.getViewport({ scale: 1.7 });
          if (viewport.width * viewport.height > 12_000_000) throw new Error("Scanned PDF page exceeds the render limit.");
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
            canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
          text = await ocrImage(canvas.toBuffer("image/png"));
          ocrCount += 1;
        }
        pages.push({ page: index, text });
        page.cleanup();
      }
      return pages;
    } finally {
      await task.destroy();
    }
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return [{ page: null, text: result.value.slice(0, MAX_PAGE_CHARS) }];
  }
  return [{ page: 1, text: await ocrImage(bytes) }];
}

export async function countContractPages(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_BYTES || detectContractMime(bytes) !== mime)
    throw new Error("Contract file type or size is invalid.");
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    if (!result.value.trim()) throw new Error("The DOCX has no readable contract text.");
    return 1;
  }
  if (mime !== "application/pdf") {
    const metadata = await sharp(Buffer.from(bytes), { limitInputPixels: 36_000_000 }).metadata();
    if (!metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000)
      throw new Error("Scanned image dimensions exceed the extraction limit.");
    return 1;
  }
  const task = getDocument({ data: Uint8Array.from(bytes) });
  try {
    const document = await task.promise;
    if (document.numPages < 1 || document.numPages > MAX_PAGES) throw new Error("PDF exceeds the 20 page limit.");
    return document.numPages;
  } finally {
    await task.destroy();
  }
}

function proposal(fieldKey: FieldKey, category: Category, pages: SourcePage[],
  expression: RegExp, interpret: (match: RegExpMatchArray) => unknown): ContractProposal {
  for (const source of pages) {
    const match = source.text.match(expression);
    if (!match || match.index == null) continue;
    const span = match[0].trim().slice(0, 500);
    const proposedValue = interpret(match);
    const ambiguous = proposedValue == null || /\b(TBD|to be agreed|negotiated|unknown)\b/i.test(span);
    return { fieldKey, category, businessState: !ambiguous && source.page ? "clear" : "review_recommended",
      proposedValue: ambiguous ? null : proposedValue,
      source: { page: source.page, span, start: match.index, end: match.index + match[0].length } };
  }
  return { fieldKey, category, businessState: "not_found", proposedValue: null,
    source: { page: null, span: null, start: null, end: null } };
}

const weekday = new Map([["sunday",0],["monday",1],["tuesday",2],["wednesday",3],
  ["thursday",4],["friday",5],["saturday",6]]);
function responsibility(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("client")) return "client_provided";
  if (lower.includes("reimburs")) return "reimbursable";
  if (lower.includes("included")) return "included";
  if (lower.includes("mixed")) return "mixed";
  return null;
}

export const deterministicContractProvider: ContractExtractionProvider = {
  name: "deterministic", version: "1",
  async extract(pages) {
    const proposals: ContractProposal[] = [
      proposal("contract_name", "identity", pages, /Contract name:\s*([^\n;]{2,160})/i, (m) => m[1].trim()),
      proposal("effective_from", "identity", pages, /Effective from:\s*(\d{4}-\d{2}-\d{2}|TBD)/i, (m) => m[1]),
      proposal("effective_to", "identity", pages, /Effective to:\s*(\d{4}-\d{2}-\d{2}|TBD)/i, (m) => m[1]),
      proposal("financial_term", "commercial", pages,
        /(Monthly fee|Annual fee|Hourly rate|Project fee):\s*(CAD|USD)\s*([\d,]+(?:\.\d{2})?|TBD)/i,
        (m) => Number.isFinite(Number(m[3].replaceAll(",", ""))) ? {
          basis: { "monthly fee": "fixed_monthly", "annual fee": "fixed_annual",
            "hourly rate": "hourly", "project fee": "project_fixed" }[m[1].toLowerCase()],
          currency: m[2].toUpperCase(), amount: Number(m[3].replaceAll(",", "")),
        } : null),
      proposal("payment_terms", "commercial", pages, /Payment terms:\s*([^\n;]{2,160})/i, (m) => m[1].trim()),
      proposal("staffing", "operational", pages,
        /Staffing:\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2}),?\s*(\d+|TBD)\s+(?:cleaners|positions)/i,
        (m) => /^\d+$/.test(m[4]) ? { weekday: weekday.get(m[1].toLowerCase()),
          localStart: m[2], localEnd: m[3], requiredPositions: Number(m[4]) } : null),
      proposal("obligation", "operational", pages,
        /Recurring task:\s*([^\n;]{2,160});?\s*frequency:\s*(daily|weekly|monthly|quarterly|annual|TBD)/i,
        (m) => m[2].toLowerCase() === "tbd" ? null : { name: m[1].trim(), recurrence: m[2].toLowerCase() }),
      proposal("sla_term", "operational", pages, /SLA:\s*([^\n;]{2,300})/i, (m) => m[1].trim()),
      proposal("reporting_term", "operational", pages, /Reporting:\s*([^\n;]{2,300})/i, (m) => m[1].trim()),
      proposal("supply_responsibility", "operational", pages, /Supplies:\s*([^\n;]{2,100})/i, (m) => responsibility(m[1])),
      proposal("equipment_responsibility", "operational", pages, /Equipment:\s*([^\n;]{2,100})/i, (m) => responsibility(m[1])),
      proposal("repair_responsibility", "operational", pages, /Repairs:\s*([^\n;]{2,100})/i, (m) => responsibility(m[1])),
      proposal("additional_work", "commercial", pages, /Additional work:\s*([^\n;]{2,300})/i, (m) => m[1].trim()),
    ];
    return { schemaVersion: 1, provider: this.name, providerVersion: this.version, proposals };
  },
};

export async function extractContractDocument(bytes: Uint8Array, mime: string,
  provider: ContractExtractionProvider = deterministicContractProvider,
  timeoutMs = 15_000): Promise<{ result: ContractExtractionResult; pageCount: number }> {
  const pages = await readContractPages(bytes, mime);
  // Document content is data only. The provider has no credentials, tools or mutation callback.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const raw = await Promise.race([provider.extract(pages), new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Contract extraction provider timed out.")), timeoutMs);
  })]).finally(() => { if (timer) clearTimeout(timer); });
  const result = contractExtractionResultSchema.parse(raw);
  for (const item of result.proposals) {
    if (item.source.page === null || item.source.span === null) continue;
    const source = pages.find((page) => page.page === item.source.page);
    const { start, end } = item.source;
    if (!source || start === null || end === null ||
      source.text.slice(start, end).trim().slice(0, 500) !== item.source.span)
      throw new Error("Extraction source citation did not match the document.");
  }
  return { result, pageCount: pages.length };
}

export function contractSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
