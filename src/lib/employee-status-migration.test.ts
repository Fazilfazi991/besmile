import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808024619_employee_status_completion.sql'), 'utf8');

describe('employee status completion migration', () => {
  it('adds statuses and preserves protected history/audit workflow', () => {
    for (const status of ['intern', 'probation', 'resigned']) expect(sql).toContain(`add value if not exists '${status}'`);
    expect(sql).toContain('before update of status on public.profiles');
    expect(sql).toContain('insert into public.employee_status_history');
    expect(sql).toContain("'employee_status_changed'");
    expect(sql).toContain("next_status in ('inactive', 'resigned', 'terminated')");
  });

  it('keeps payroll eligibility active-only pending a separate policy decision', () => {
    expect(sql).toContain("profile.status = 'active'");
    expect(sql).toContain('Intern/probation');
  });
});
