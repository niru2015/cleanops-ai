import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("../artifacts/tornado-demo/", import.meta.url);

const baseURL = process.env.TORNADO_DEMO_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.TORNADO_DEMO_PASSWORD ?? process.env.CLEANOPS_DEMO_PASSWORD;
const publicOnly = process.env.TORNADO_DEMO_PUBLIC_ONLY === "1";
let target;
try { target = new URL(baseURL); } catch { console.error("TORNADO_DEMO_BASE_URL must be a valid URL."); process.exit(2); }
const local = target.origin === "http://127.0.0.1:3000";
if ((!local && target.protocol !== "https:") || target.pathname !== "/" || target.search || target.hash) {
  console.error("The demo target must be the local origin or an HTTPS origin without a path, query, or fragment.");
  process.exit(2);
}
const allowedOrigin = process.env.TORNADO_DEMO_ALLOWED_ORIGIN;
if (process.env.CI && !local && !allowedOrigin) {
  console.error("CI requires TORNADO_DEMO_ALLOWED_ORIGIN to protect demo credentials.");
  process.exit(2);
}
if (allowedOrigin && target.origin !== allowedOrigin) {
  console.error("The demo target does not match TORNADO_DEMO_ALLOWED_ORIGIN.");
  process.exit(2);
}
const preflight = {
  baseURL,
  mode: local ? "local" : "external",
  credentialsPresent: Boolean(password),
  legacyOperationsCredentialsPresent: Boolean(process.env.TORNADO_OPERATIONS_PASSWORD),
  expectMobileEvidence: process.env.TORNADO_EXPECT_MOBILE_EVIDENCE === "1",
  publicOnly,
  startedAt: new Date().toISOString(),
};
if (!password && !publicOnly) {
  console.error("Tornado demo needs TORNADO_DEMO_PASSWORD (or CLEANOPS_DEMO_PASSWORD). See TORNADO_DEMO.md.");
  process.exit(2);
}
mkdirSync(root, { recursive: true });
for (const part of ["screenshots", "results", "videos-and-traces", "html-report"]) {
  rmSync(new URL(part, root), { recursive: true, force: true });
  mkdirSync(new URL(part, root), { recursive: true });
}
writeFileSync(new URL("results/preflight.json", root), JSON.stringify(preflight, null, 2) + "\n");
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "--config=tornado.playwright.config.ts", ...(publicOnly ? ["--grep", "UAT-00"] : process.argv.slice(2))], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, TORNADO_DEMO_BASE_URL: baseURL, TORNADO_DEMO_PASSWORD: password },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
