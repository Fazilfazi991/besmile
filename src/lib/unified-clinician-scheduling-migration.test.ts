import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808123000_unified_clinician_self_availability_reminders.sql'), 'utf8');
const syncMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808131500_sync_staff_clinician_profiles.sql'), 'utf8');
const hrBoundaryMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808134500_exclude_nonemployees_from_hr.sql'), 'utf8');

describe('unified clinician scheduling migration', () => {
  it('uses explicit account linkage and keeps outsourced clinicians outside HR', () => {
    expect(migration).toContain('is_employee boolean not null default true');
    expect(migration).toContain('profile_id uuid references public.profiles(id)');
    expect(migration).toContain('outsourced_doctors_profile_id_unique_idx');
    expect(migration).toContain("'staff_psychologist','psychology_intern','outsourced'");
    expect(migration).not.toMatch(/lower\([^)]*email[^)]*\)\s*=\s*lower/i);
  });

  it('keeps future staff clinicians synchronized by profile UUID', () => {
    expect(syncMigration).toContain('sync_staff_clinician_profile');
    expect(syncMigration).toContain('on conflict(profile_id) where profile_id is not null');
    expect(syncMigration).toContain("new.role::text = 'psychologist'");
    expect(syncMigration).not.toMatch(/lower\([^)]*email[^)]*\)\s*=\s*lower/i);
  });

  it('enforces the non-employee HR boundary in RLS', () => {
    expect(hrBoundaryMigration).toContain('public.profile_is_employee(profile_id)');
    expect(hrBoundaryMigration).toContain('attendance self team or manager write');
    expect(hrBoundaryMigration).toContain('leave create own');
    expect(hrBoundaryMigration).toContain('salary settings access');
    expect(hrBoundaryMigration).toContain('payroll entries access');
  });

  it('enforces own availability in the database and replaces ranges atomically', () => {
    expect(migration).toContain('public.current_clinician_id()');
    expect(migration).toContain('public.can_manage_clinician(target_doctor)');
    expect(migration).toContain('create or replace function public.replace_clinician_availability');
    expect(migration).toContain("raise exception 'Permission denied for clinician availability'");
    expect(migration).toContain('delete from public.doctor_weekly_availability where doctor_id = target_doctor');
  });

  it('limits outsourced patient visibility to assigned appointments', () => {
    expect(migration).toContain('patients assigned clinician appointment access');
    expect(migration).toContain('appointment.doctor_id = (select public.current_clinician_id())');
    expect(migration).toContain('appointment.deleted_at is null');
  });

  it('scopes appointment notifications and deep links to the assigned clinician workspace', () => {
    expect(migration).toContain('notify_clinician_appointment_change');
    expect(migration).toContain("'/clinician/schedule?appointment='");
    expect(migration).toContain('new_recipient');
    expect(migration).not.toContain('for recipient in select id from public.profiles');
  });

  it('provides one configurable reminder job with reschedule-aware deduplication', () => {
    expect(migration).toContain('appointment_reminder_settings');
    expect(migration).toContain('lead_minutes integer not null default 120');
    expect(migration).toContain('unique(appointment_id, recipient_id, appointment_start, lead_minutes)');
    expect(migration).toContain("cron.schedule('bsmile-appointment-reminders', '*/5 * * * *'");
    expect(migration).toContain('delivery.appointment_start = appointment.start_at');
  });

  it('revokes public execution from security definer entry points', () => {
    for (const signature of [
      'current_clinician_id()',
      'can_manage_clinician(uuid)',
      'replace_clinician_availability(uuid, jsonb)',
      'run_appointment_reminders()',
    ]) expect(migration).toContain(`revoke execute on function public.${signature} from public`);
  });
});
