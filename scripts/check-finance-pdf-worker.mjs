import { readFileSync } from "node:fs";
import { join } from "node:path";

const distDir = process.env.CLEANOPS_NEXT_DIST_DIR || ".next";
const routes = [
  "finance/contracts/new",
  "finance/contracts/[id]/review",
  "finance/expenses",
  "finance/inbox",
];
const worker = "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";

for (const route of routes) {
  const tracePath = join(distDir, "server/app", route, "page.js.nft.json");
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  if (!trace.files.some((file) => file.endsWith(worker))) {
    throw new Error(`PDF worker is missing from the ${route} server trace.`);
  }
}

console.log("PDF worker is included in finance server traces.");
