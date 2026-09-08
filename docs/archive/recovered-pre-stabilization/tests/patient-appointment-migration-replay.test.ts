import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("patient appointment migration replay", () => {
  it("compares legacy role labels as text instead of coercing them into app_role", () => {
    for (const migration of [
      read("supabase/migrations/0084_patient_appointment_actions_and_access.sql"),
      read("supabase/migrations/0085_patient_navigation_appointments_idea_permissions.sql"),
    ]) {
      expect(migration).toContain("role.code::text");
      expect(migration).not.toMatch(/role\.code in \('administration|role\.code in \('social_worker/);
    }
  });
});


