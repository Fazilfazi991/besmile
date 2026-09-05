import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  resolve(process.cwd(), "src/app/admin/page.tsx"),
  "utf8",
);

describe("production dashboard density regression", () => {
  it("keeps one compact operational page identity without the legacy hub hero", () => {
    expect(dashboard).toContain("Company operations at a glance");
    expect(dashboard).not.toContain('className="standard-hub-header"');
    expect(dashboard).not.toContain("Welcome to Bsmile — The Mind Studio Hub");
  });

  it("keeps secondary dashboard content behind progressive disclosure", () => {
    expect(dashboard).toContain('className="dashboard-more-insights"');
    expect(dashboard).toContain("More insights");
  });
});
