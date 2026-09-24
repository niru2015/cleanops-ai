import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const cli = (args: string[]) => spawnSync(process.execPath, ["scripts/demo-scenario.mjs", ...args], {
  cwd: process.cwd(), encoding: "utf8", env: {
    ...process.env,
    CLEANOPS_HOSTED_DEMO_URL: "",
    CLEANOPS_HOSTED_DEMO_SECRET_KEY: "",
    CLEANOPS_HOSTED_DEMO_PUBLISHABLE_KEY: "",
    CLEANOPS_HOSTED_DEMO_PASSWORD: "",
  },
});

describe("hosted demo CLI guards", () => {
  const target = ["--target", "hosted", "--project-ref", "jfhpbabelqldhemrmvgc",
    "--organization-id", "62dc9966-0210-59ad-a8a6-fe5a89b68c0b"];

  it("prints the deterministic organization and controls without a database connection", () => {
    const result = cli(["plan", "finance-showcase"]);
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout);
    expect(plan.organizationId).toBe(target.at(-1));
    expect(plan.expected.finance.currency).toBe("CAD");
  });

  it("requires explicit apply for hosted writes", () => {
    const result = cli(["generate", "finance-showcase", ...target]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Hosted writes require --apply");
  });

  it("refuses a different organization before connecting", () => {
    const result = cli(["preflight", "finance-showcase", ...target.slice(0, -1),
      "00000000-0000-4000-8000-000000000001"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("differs from the deterministic plan");
  });

  it("refuses missing protected connection details", () => {
    const result = cli(["preflight", "finance-showcase", ...target]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Hosted endpoint, secret, publishable key");
  });
});
