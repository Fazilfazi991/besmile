import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  resolve(process.cwd(), "src/components/permission-sidebar.tsx"),
  "utf8",
);
const density = readFileSync(
  resolve(process.cwd(), "src/app/workspace-density.css"),
  "utf8",
);

describe("Phase 3D contextual module navigation", () => {
  it("uses one permission-filtered section model for flyouts and direct links", () => {
    expect(sidebar).toContain("composeSidebarSections(groups)");
    expect(sidebar).toContain("const hasChildren = section.links.length > 1");
    expect(sidebar).toContain("nav-section-direct");
    expect(sidebar).not.toContain("const financeLinks");
  });

  it("keeps desktop secondary navigation out of the permanent sidebar", () => {
    expect(sidebar).toContain("drawer && hasChildren && isMobileOpen");
    expect(sidebar).toContain('className="module-flyout"');
    expect(density).toContain("position:fixed;z-index:110;width:220px");
    expect(density).toContain("max-height:calc(100vh - 24px)");
  });

  it("supports collapsed, route-aware and dismissible flyout behavior", () => {
    expect(sidebar).toContain("title={collapsed ? section.title : undefined}");
    expect(sidebar).toContain("activeSection === section.title");
    expect(sidebar).toMatch(
      /document\.addEventListener\(["']pointerdown["'], outside\)/,
    );
    expect(sidebar).toMatch(/event\.key !== ["']Escape["']/);
    expect(sidebar).toMatch(
      /window\.addEventListener\(["']resize["'], close\)/,
    );
    expect(sidebar).toContain("closeOnScroll");
  });

  it("preserves mobile accordion navigation instead of rendering the desktop flyout", () => {
    expect(sidebar).toContain("mobile-nav-children");
    expect(sidebar).toContain("setSectionState");
    expect(density).toContain(
      "@media(max-width:900px){.module-flyout{display:none}",
    );
  });

  it("groups Work Management links consistently on desktop and mobile", () => {
    expect(sidebar).toContain('title: "Performance"');
    expect(sidebar).toContain('title: "Communication"');
    expect(sidebar).toContain("COMMUNICATION_LINK_LABELS");
    expect(sidebar).toContain('"Teams"');
    expect(sidebar).toContain("groupedSectionLinks(flyoutSection)");
    expect(sidebar).toContain("groupedSectionLinks(section)");
    expect(sidebar).toContain("groupedSectionLinks(launcherSection)");
    expect(density).toContain("module-flyout-group");
    expect(density).toContain("mobile-launcher-link-group");
  });

  it("provides keyboard and ARIA affordances", () => {
    expect(sidebar).toContain("aria-expanded=");
    expect(sidebar).toContain("aria-controls=");
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"])
      expect(sidebar).toContain(key);
    expect(sidebar).toContain("querySelector<HTMLAnchorElement>");
    expect(sidebar).toContain(".module-flyout-link");
  });
});
