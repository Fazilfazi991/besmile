import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260808182000_general_manager_finance_manage.sql"),
  "utf8",
);

describe("general manager finance permission migration replay", () => {
  it("supports both known role-permission schemas", () => {
    expect(migration).toContain("column_name = 'role_id'");
    expect(migration).toContain("insert into public.role_permissions(role_id, permission_id)");
    expect(migration).toContain("column_name = 'role'");
    expect(migration).toContain("Unsupported role_permissions schema");
  });
});


