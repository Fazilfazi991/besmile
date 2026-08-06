import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0086_fix_doctor_scheduling_visibility_access.sql'), 'utf8');

describe('doctor scheduling visibility access migration', () => {
  it('assigns management and Psychology scheduling bundles', () => {
    expect(migration).toContain("role.code in ('chairman','director','general_manager')");
    expect(migration).toContain("role.code = 'psychologist'");
    expect(migration).toContain("('Psychology Psychologist', 'Psychology', 'Psychologist', true)");
    expect(migration).toContain("('Psychology Intern Psychologist', 'Psychology', 'Intern Psychologist', true)");
  });

  it('does not give automatic scheduling access to generic Interns', () => {
    expect(migration).toContain("role.code = 'intern'");
    expect(migration).toContain("lower(bundle.designation) = 'intern'");
    expect(migration).not.toContain("role.code = 'intern' and permission.code = any(care_team_permissions)");
  });

  it('keeps doctor profile management and appointment deletion out of care-team bundles', () => {
    const careTeamBlock = migration.match(/care_team_permissions text\[\] := array\[([\s\S]*?)\];/)?.[1] || '';
    expect(careTeamBlock).not.toContain('doctor_scheduling.manage_doctors');
    expect(careTeamBlock).not.toContain('appointments.delete');
  });
});
