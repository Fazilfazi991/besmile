import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

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

  it("fits the true tree to the mobile viewport without horizontal scrolling", () => {
    expect(styles).toContain("@media(max-width:700px)");
    expect(styles).toContain(".organization-chart-viewport{display:block;width:100%;max-width:100%;overflow-x:hidden");
    expect(styles).toContain(".organization-chart-tree{width:100%;max-width:none}");
    expect(styles).toContain('ul[data-parent="general-manager"]>li{flex:1 1 50%;width:50%}');
    expect(styles).toContain(".organization-chart-node-assistant-manager>ul{position:absolute");
    expect(component).not.toContain("Swipe to explore");
    expect(component).not.toContain("scrollLeft");
  });

  it("preserves the layout-derived desktop tree and mobile card dimensions", () => {
    expect(styles).toContain(".organization-chart-tree,.organization-chart-tree ul{display:flex");
    expect(styles).toContain(".organization-chart-card{position:relative;z-index:1;display:grid;width:150px;height:116px");
    expect(styles).toContain(".organization-chart-card{width:96px;height:88px");
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
