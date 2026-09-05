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
    expect(employeeProfile).toContain("<ProfileOrganizationChart profileName={profile.full_name} isSelf />");
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

  it("uses a mobile vertical layout without page-level horizontal overflow", () => {
    expect(styles).toContain("@media(max-width:700px)");
    expect(styles).toContain(".organization-chart-tree,.organization-chart-tree ul{display:grid");
    expect(styles).not.toContain("overflow-x:auto");
  });

  it("introduces no chart data or API fetching", () => {
    expect(component).not.toMatch(/fetch\(|supabase|employeeRepository|adminRepository|\/api\//);
  });
});
