import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260929051854_sales_coordinator_access_hotfix.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

describe("Marketing Sales Coordinator access hotfix", () => {
  it("adds the Marketing designation bundle without changing profile data", () => {
    expect(migration).toContain("'Marketing Sales Coordinator'");
    expect(migration).toContain("'Marketing',\n  'Sales Coordinator'");
    expect(migration).toContain("on conflict(department_name, designation) do update");
    expect(migration).not.toMatch(/update\s+public\.profiles|insert\s+into\s+public\.profiles/i);
  });

  it("matches the approved Operations baseline exactly", () => {
    for (const permission of [
      "attendance.self",
      "crm.import",
      "crm.view_assigned",
      "dashboard.view",
      "leads.create",
      "leads.edit",
      "leads.view_all",
      "leave.self",
      "patients.view_identity",
      "tasks.view_self",
    ]) {
      expect(migration).toContain(`'${permission}'`);
    }
    expect(migration).toContain("operations_permissions is distinct from expected_permissions");
    expect(migration).toContain("granted_count <> 10");
  });

  it("does not grant administrative, finance, HR, attendance-team, or clinical access", () => {
    const grant = migration.slice(
      migration.indexOf("insert into public.designation_permission_bundle_permissions"),
    );
    expect(grant).not.toMatch(
      /crm\.manage_all|leads\.assign|attendance\.manage|attendance\.view_team|finance\.|payroll\.|employees\.manage|roles\.manage|permissions\.manage|clinical_notes\./,
    );
  });
});
