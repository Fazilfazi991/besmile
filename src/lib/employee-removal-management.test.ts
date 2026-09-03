import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260811160000_employee_removal_management.sql', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
const listPage = readFileSync(new URL('../app/admin/employees/page.tsx', import.meta.url), 'utf8');
const detailPage = readFileSync(new URL('../app/admin/employees/[id]/page.tsx', import.meta.url), 'utf8');
const meetingRepository = readFileSync(new URL('./calendar-meeting-repository.ts', import.meta.url), 'utf8');
const payrollMigration = readFileSync(new URL('../../supabase/migrations/20260808180000_payroll_atomic_lifecycle.sql', import.meta.url), 'utf8');
const chatMigration = readFileSync(new URL('../../supabase/migrations/20260811150000_chat_company_group_voice.sql', import.meta.url), 'utf8');

describe('employee removal management', () => {
  it('grants the dedicated permission to Chairman, Director and General Manager, not staff', () => {
    expect(migration).toContain("('employees.remove', 'Remove and restore ordinary employee accounts')");
    expect(migration).toContain("where role.code in ('chairman', 'director', 'general_manager')");
    expect(migration).not.toMatch(/role\.code in \([^)]*staff/);
  });

  it('enforces authorization, direct-action rejection, self protection and protected-account safety in the database', () => {
    expect(migration).toContain("not public.has_permission('employees.remove')");
    expect(migration).toContain('You cannot remove your own employee account');
    expect(migration).toContain('Protected management accounts cannot be removed');
    expect(migration).toContain("current_setting('app.employee_removal_action', true)");
    expect(migration).toContain("raise exception 'You do not have permission to change employee status'");
    expect(migration).toContain('revoke all on function public.remove_employee(uuid, text) from public, anon, authenticated');
  });

  it('soft-removes the profile, revokes active grants and preserves dependent business records', () => {
    expect(migration).toContain("status = 'inactive'::public.record_status");
    expect(migration).toContain('login_enabled = false');
    expect(migration).toContain('update public.user_permission_grants');
    expect(migration).not.toContain('delete from public.profiles');
    expect(migration).not.toContain('delete from public.attendance');
    expect(migration).not.toContain('delete from public.payroll');
    expect(migration).not.toContain('delete from public.chat');
    expect(migration).toContain('revoke delete on table public.profiles from authenticated, anon');
  });

  it('records removal metadata, a reasoned audit event and an audited restore without reviving direct grants', () => {
    expect(migration).toContain('removed_at timestamptz');
    expect(migration).toContain('removal_reason text');
    expect(migration).toContain("'employee_removed'");
    expect(migration).toContain("'employee_restored'");
    expect(migration).toContain("'direct_grants_restored', false");
    expect(migration).toContain("set status = 'active'::public.record_status");
  });

  it('keeps historical/admin visibility while defaulting the directory to current workforce', () => {
    expect(repository).toContain('removed_at,removal_reason,removed_by');
    expect(listPage).toContain("useState<WorkforceView>('active')");
    expect(listPage).toContain('Removed / inactive');
    expect(detailPage).toContain('Historical attendance, payroll, tasks, CRM, Chat, meetings, finance and audit records remain available.');
    expect(detailPage).toContain('Remove employee');
    expect(detailPage).toContain('Restore employee');
  });

  it('keeps removed employees out of meeting, payroll and Chat eligibility', () => {
    expect(meetingRepository).toContain(".rpc('meeting_workforce')");
    expect(payrollMigration).toContain("profile.status = 'active'");
    expect(chatMigration).toContain("p.status::text in ('active', 'intern', 'probation')");
  });
});
