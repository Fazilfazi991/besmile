import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0081_employee_idea_announcement_baseline.sql"),
  "utf8",
);

describe("idea and announcement baseline migration replay", () => {
  it("compares enum role codes as text when excluding the legacy super-admin role", () => {
    expect(migration).toContain("coalesce(role.code::text, '') <> 'super_admin'");
    expect(migration).not.toContain("coalesce(role.code, '') not in ('super_admin')");
  });
});


