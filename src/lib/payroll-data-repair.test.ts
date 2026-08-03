import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0071_payroll_period_and_paid_status_repair.sql'), 'utf8');

describe('payroll data repair migration', () => {
  it('recalculates existing payroll run period ends from the stored month', () => {
    expect(migration).toContain('update public.payroll_runs');
    expect(migration).toContain("interval '1 month - 1 day'");
    expect(migration).toContain('period_end is distinct from');
  });

  it('marks runs paid only when every entry is paid', () => {
    expect(migration).toContain("set status = 'paid'");
    expect(migration).toContain('exists (');
    expect(migration).toContain('not exists (');
    expect(migration).toContain("entry.payment_status <> 'paid'");
  });
});
