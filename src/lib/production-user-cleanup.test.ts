import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260813130000_production_user_cleanup.sql");
const adminRepository = read("src/lib/admin-repository.ts");
const globalSearch = read("src/components/global-command-center.tsx");
const employees = read("src/lib/employees.ts");

describe("production workforce cleanup", () => {
  it("uses reviewed identities and preserves canonical business history", () => {
    expect(migration).toContain("employee_identity_merged");
    expect(migration).toContain("history_reassigned");
    expect(migration).toContain("reviewed_cleanup_targets");
    expect(migration).toContain("Duplicate Diya identity merged");
    expect(migration).toContain("Duplicate Aiswarya identity merged");
    expect(migration.toLowerCase()).not.toContain("email not in");
    expect(migration.toLowerCase()).not.toContain("delete from public.profiles");
  });

  it("keeps restricted Assistant Manager permissions out of HR and finance", () => {
    expect(migration).toContain("'crm.view_team'");
    expect(migration).toContain("'leads.assign'");
    expect(migration).toContain("permission.code like 'employees.%'");
    expect(migration).toContain("permission.code like 'finance.%'");
    expect(migration).toContain("permission.code like 'payroll.%'");
  });

  it("filters shared active-workforce selectors by employment, visibility, login and status", () => {
    for (const source of [adminRepository, globalSearch, employees]) {
      expect(source).toContain("is_employee");
      expect(source).toContain("workforce_visible");
      expect(source).toContain("login_enabled");
      expect(source).toContain("active");
    }
  });
});
