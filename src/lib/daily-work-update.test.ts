import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dailyWorkValidationMessage } from "./daily-work-rules";

const migration = readFileSync("supabase/migrations/20260907203658_daily_work_updates.sql", "utf8");
const repository = readFileSync("src/lib/employee-repository.ts", "utf8");

describe("daily work updates", () => {
  it("rejects empty, whitespace-only, and oversized updates", () => {
    expect(dailyWorkValidationMessage("")).toMatch(/describe/i);
    expect(dailyWorkValidationMessage("   ")).toMatch(/describe/i);
    expect(dailyWorkValidationMessage("x".repeat(4001))).toMatch(/4,000/i);
    expect(dailyWorkValidationMessage("completed follow-ups")).toBeNull();
  });
  it("keeps one editable update per employee and work date", () => {
    expect(migration).toContain("unique (profile_id, work_date)");
    expect(repository).toContain('{ onConflict: "profile_id,work_date" }');
  });
  it("enforces owner writes and scoped workforce reads with RLS", () => {
    expect(migration).toContain("alter table public.daily_work_updates enable row level security");
    expect(migration).toContain("profile_id = (select auth.uid())");
    expect(migration).toContain("public.in_management_tree(profile_id)");
    expect(migration).toContain("revoke all on public.daily_work_updates from anon");
  });
});
