import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0087_fix_psychologist_account_bundle_mapping.sql'), 'utf8');

describe('psychologist account bundle mapping migration', () => {
  it('corrects the legacy Aiswarya login by stable email', () => {
    expect(migration).toContain("lower(profile.email) = 'aiswarya.p@bsmile.local'");
    expect(migration).toContain("role = 'psychologist'::public.app_role");
    expect(migration).toContain("designation = 'Psychologist'");
  });

  it('maps both Intern Psychologist names through reusable Psychology bundles', () => {
    expect(migration).toContain("('Psychology Intern Psychologist', 'Psychology', 'Intern Psychologist', true)");
    expect(migration).toContain("('Psychology Psychology Intern', 'Psychology', 'Psychology Intern', true)");
  });

  it('does not grant doctor management or deletion to Psychology care teams', () => {
    const careTeamBlock = migration.match(/care_team_permissions text\[\] := array\[([\s\S]*?)\];/)?.[1] || '';
    expect(careTeamBlock).not.toContain('doctor_scheduling.manage_doctors');
    expect(careTeamBlock).not.toContain('appointments.delete');
  });

  it('keeps the generic Intern role and bundle outside Doctor Scheduling', () => {
    expect(migration).toContain("role.code = 'intern'");
    expect(migration).toContain("lower(bundle.designation) = 'intern'");
  });
});
