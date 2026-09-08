import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/0052_finance_granular_rls_access.sql");

describe("finance granular RLS migration replay", () => {
  it("replaces every granular policy that earlier migrations may have created", () => {
    for (const policy of [
      "finance accounts granular view",
      "finance accounts granular manage",
      "finance income categories granular view",
      "finance expense categories granular view",
      "finance transactions granular read",
      "finance transactions granular insert",
      "finance transactions granular update",
    ]) {
      expect(migration).toContain(`drop policy if exists "${policy}"`);
      expect(migration).toContain(`create policy "${policy}"`);
    }
  });
});


