import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { organizationChart } from "@/lib/organization-chart-config";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("profile organization chart integration", () => {
  const component = read("src/components/profile-organization-chart.tsx");
  const styles = read("src/components/profile-organization-chart.css");
  const employeeProfile = read("src/app/employee/profile/page.tsx");
  const adminProfile = read("src/app/admin/employees/[id]/page.tsx");
  const clinicianProfile = read("src/app/clinician/profile/page.tsx");

  it("renders one shared accessible chart on employee and admin profiles", () => {
    expect(component).toContain('aria-label="BSmile organization hierarchy"');
    expect(employeeProfile).toContain("<ProfileOrganizationChart profileName={profile.full_name} profilePhoto={photo} isSelf />");
    expect(adminProfile).toContain("<ProfileOrganizationChart");
  });

  it("shows You only for the matched self-profile state", () => {
    expect(component).toContain("highlighted && isSelf");
    expect(component).toContain('organization-chart-you">You');
    expect(adminProfile).toContain("isSelf={viewer?.id === profile.id}");
  });

  it("does not add the employee chart to clinician profiles", () => {
    expect(clinicianProfile).not.toContain("ProfileOrganizationChart");
  });

  it("uses the recursive hierarchy on mobile without local scrolling", () => {
    expect(styles).toContain("@media(max-width:700px)");
    expect(styles).toContain(".organization-chart-viewport{display:block;width:100%;max-width:100%;overflow:hidden");
    expect(styles).toContain(".organization-chart-mobile,.organization-chart-mobile ul{position:relative;display:grid;width:100%");
    expect(styles).toContain(".organization-chart-mobile{max-width:340px;margin-inline:auto");
    expect(component).toContain("<OrganizationBranch key={root.key}");
    expect(component).not.toContain("mobileCard");
  });

  it("derives mobile connector geometry from the recursive reporting tree", () => {
    expect(styles).toContain(".organization-chart-mobile ul::before");
    expect(styles).toContain(".organization-chart-mobile li+li::before");
    expect(styles).toContain(".organization-chart-mobile li li>.organization-chart-card::before");
    expect(styles).not.toContain("width:200%");
    expect(styles).not.toContain("translateX(-50%)}.organization-chart-node-assistant-manager>ul");
  });

  it("keeps every mobile card readable instead of constraining it to 88px", () => {
    expect(styles).toContain(".organization-chart-mobile .organization-chart-card{width:min(224px,calc(100% - 20px));height:auto;min-height:108px");
    expect(styles).not.toContain("organization-chart-card{width:88px");
    expect(styles).toContain(".organization-chart-mobile .organization-chart-identity{width:100%;min-width:0}");
    expect(styles).toContain(".organization-chart-mobile .organization-chart-identity strong{font-size:13px}");
    expect(styles).not.toMatch(/text-overflow:ellipsis/);
  });

  it("preserves the hierarchy across both mobile report rows", () => {
    expect(organizationChart.filter((node) => node.parentKey === "general-manager").map((node) => node.key)).toEqual(["assistant-manager", "sales-coordinator"]);
    expect(organizationChart.filter((node) => node.parentKey === "assistant-manager").map((node) => node.key)).toEqual(["psychologist", "admin", "intern"]);
  });

  it("preserves the layout-derived desktop tree and card dimensions", () => {
    expect(styles).toContain(".organization-chart-tree,.organization-chart-tree ul{display:flex");
    expect(styles).toContain(".organization-chart-card{position:relative;z-index:1;display:grid;width:150px;height:116px");
    expect(styles).toContain(".organization-chart-mobile{display:none}");
  });

  it("preserves an already-loaded real profile photo for the matched person", () => {
    expect(component).toContain("highlighted && profilePhoto ? profilePhoto : node.avatar");
    expect(employeeProfile).toContain("profilePhoto={photo}");
    expect(adminProfile).toContain("profilePhoto={photo}");
  });

  it("uses the supplied Diya portrait and initials for people without a safe photo", () => {
    const config = read("src/lib/organization-chart-config.ts");
    expect(config).toContain('avatar: "/organization-chart/diya-anthikat.png"');
    expect(config).toContain('avatar: "/organization-chart/anushma-vk.png"');
    expect(config).toContain('avatar: "/organization-chart/yousaf-ks.png"');
    expect(config).toContain('avatar: "/organization-chart/aiswarya-p.png"');
    expect(config).not.toContain("employee_demo_dps_webp");
    expect(component).toContain("<span>{initials(node.displayName)}</span>");
  });

  it("introduces no chart data or API fetching", () => {
    expect(component).not.toMatch(/fetch\(|supabase|employeeRepository|adminRepository|\/api\//);
  });
});
