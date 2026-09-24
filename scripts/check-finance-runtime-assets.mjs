import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const distDir = process.env.CLEANOPS_NEXT_DIST_DIR || ".next";
const routes = [
  "finance/contracts/new",
  "finance/contracts/[id]/review",
  "finance/expenses",
  "finance/inbox",
];
const worker = "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";
const ocrRoutes = ["finance/contracts", "finance/contracts/new", "finance/contracts/[id]/review", "finance/inbox"];
const ocrFiles = [
  "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz",
  ...readdirSync("node_modules/tesseract.js-core")
    .filter((file) => file.endsWith(".wasm"))
    .map((file) => `node_modules/tesseract.js-core/${file}`),
];

if (ocrFiles.length < 2) throw new Error("No Tesseract WASM assets were found locally.");

for (const route of routes) {
  const tracePath = join(distDir, "server/app", route, "page.js.nft.json");
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  if (!trace.files.some((file) => file.endsWith(worker))) {
    throw new Error(`PDF worker is missing from the ${route} server trace.`);
  }
}

for (const route of ocrRoutes) {
  const tracePath = join(distDir, "server/app", route, "page.js.nft.json");
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  for (const asset of ocrFiles) {
    if (!trace.files.some((file) => file.endsWith(asset))) {
      throw new Error(`${asset} is missing from the ${route} server trace.`);
    }
  }
}

console.log("PDF and OCR runtime assets are included in finance server traces.");
