import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sidebar = fs.readFileSync(
  path.join(root, "src/components/permission-sidebar.tsx"),
  "utf8",
);
const density = fs.readFileSync(
  path.join(root, "src/app/workspace-density.css"),
  "utf8",
);

describe("Phase 3E mobile navigation contracts", () => {
  it("renders exactly five primary mobile destinations", () => {
    expect(sidebar).toContain('aria-label="Mobile primary navigation"');
    for (const label of ["Today", "Tasks", "Create", "Profile", "All Modules"])
      expect(sidebar).toContain(`<span>${label}</span>`);
  });

  it("uses the permission-filtered module sections for launcher content", () => {
    expect(sidebar).toContain("sections.map((section)");
    expect(sidebar).toContain("groupedSectionLinks(launcherSection).map((group)");
    expect(sidebar).not.toContain("adminNavigation.map");
    expect(sidebar).not.toContain("employeeNavigation.map");
  });

  it("provides recent destinations without backend persistence", () => {
    expect(sidebar).toContain("bsmile-mobile-recents:");
    expect(sidebar).toContain("RECENT_LIMIT = 4");
    expect(sidebar).toContain("Recently used");
  });

  it("supports module drill-in with explicit back and close controls", () => {
    expect(sidebar).toContain('kind: "section"');
    expect(sidebar).toContain('aria-label="Back to all modules"');
    expect(sidebar).toContain('aria-label="Close navigation"');
  });

  it("is fixed, touch friendly, safe-area aware, and mobile only", () => {
    expect(density).toMatch(/\.mobile-bottom-nav\{position:fixed/);
    expect(density).toContain("grid-template-columns:repeat(5");
    expect(density).toContain("min-height:56px");
    expect(density).toContain("env(safe-area-inset-bottom)");
    expect(density).toContain("@media(max-width:900px)");
  });
});
