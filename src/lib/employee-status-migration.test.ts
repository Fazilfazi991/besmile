import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808024619_employee_status_completion.sql'), 'utf8');
const canonicalRepair = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808184000_restore_canonical_employee_status_values.sql'), 'utf8');

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

  it('restores every canonical database status without weakening the RPC', () => {
    for (const status of ['on_leave', 'terminated']) expect(canonicalRepair).toContain(`add value if not exists '${status}'`);
    expect(canonicalRepair).toContain("next_status not in ('active', 'inactive', 'on_leave', 'intern', 'probation', 'resigned', 'terminated')");
    expect(canonicalRepair).toContain('security definer');
    expect(canonicalRepair).toContain("grant execute on function public.change_employee_status(uuid, text, text) to authenticated");
  });
});
