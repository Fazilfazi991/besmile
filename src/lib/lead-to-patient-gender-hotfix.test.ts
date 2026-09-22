import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260922042039_normalize_lead_gender_conversion.sql",
  ),
  "utf8",
);
const dialog = readFileSync(
  resolve(process.cwd(), "src/components/lead-to-patient-conversion.tsx"),
  "utf8",
);

describe("lead-to-patient gender hotfix", () => {
  it("normalizes documented equivalents and maps only blanks to null", () => {
    expect(migration).toContain(
      "nullif(btrim(coalesce(lead_row.gender, '')), '') is null",
    );
    expect(migration).toContain("lower(btrim(lead_row.gender)) = 'male'");
    expect(migration).toContain("lower(btrim(lead_row.gender)) = 'female'");
    expect(migration).toContain("patient_gender := null");
    expect(migration).toContain("patient_gender");
    expect(migration).not.toMatch(/patient_gender\s*:=.*(?:unknown|other)/i);
  });

  it("rejects unsupported nonblank values without exposing a constraint", () => {
    expect(migration).toContain(
      "raise exception 'Lead gender must be Male or Female, or left blank.'",
    );
    expect(migration).toContain("using errcode = '22023'");
  });

  it("preserves the canonical atomic and authorization guards", () => {
    for (const value of [
      "security definer",
      "set search_path = ''",
      "public.has_permission('patients.create')",
      "public.has_permission('leads.convert_to_patient')",
      "public.has_permission('crm.manage_all')",
      "public.crm_lead_can_view",
      "for update",
      "converted_patient_id",
      "lead_converted_to_patient",
    ])
      expect(migration).toContain(value);
    expect(migration).not.toMatch(/disable\s+row level security|grant\s+all/i);
  });

  it("renders conversion feedback in the modal layer", () => {
    expect(dialog).toContain("error?: string");
    expect(dialog).toContain('role="alert"');
  });
});
