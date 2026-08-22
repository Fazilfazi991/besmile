import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schedulingGrant = readFileSync(new URL('../../supabase/migrations/20260819110000_assistant_manager_doctor_scheduling_access.sql', import.meta.url), 'utf8');
const patientVisibilityGrant = readFileSync(new URL('../../supabase/migrations/20260819110100_assistant_manager_scheduling_patient_visibility.sql', import.meta.url), 'utf8');
const availabilityGrant = readFileSync(new URL('../../supabase/migrations/20260819140000_global_clinician_availability_management.sql', import.meta.url), 'utf8');
const operationalRls = readFileSync(new URL('../../supabase/migrations/20260822100000_assistant_manager_operational_scheduling.sql', import.meta.url), 'utf8');
const schedulingUi = readFileSync(new URL('../../src/components/doctor-scheduling.tsx', import.meta.url), 'utf8');

describe('Assistant Manager appointment scheduling access', () => {
  it('grants only the designation-scoped appointment workflow capabilities', () => {
    expect(schedulingGrant).toContain("assistant.role::text = 'staff'");
    expect(schedulingGrant).toContain("assistant.designation = 'Assistant Manager'");
    expect(schedulingGrant).toContain("'doctor_scheduling.view'");
    expect(schedulingGrant).toContain("'doctor_scheduling.create_appointments'");
    expect(schedulingGrant).toContain("'doctor_scheduling.update_appointments'");
    expect(schedulingGrant).toContain("'doctor_scheduling.cancel_appointments'");
    expect(schedulingGrant).not.toContain("'doctor_scheduling.manage_doctors'");
  });

  it('adds only the patient visibility needed by appointment RLS', () => {
    expect(patientVisibilityGrant).toContain("permission.code = 'patients.view_all'");
    expect(patientVisibilityGrant).toContain("assistant.role::text = 'staff'");
    expect(patientVisibilityGrant).toContain("assistant.designation = 'Assistant Manager'");
    expect(patientVisibilityGrant).not.toContain('assistant.email');
    expect(patientVisibilityGrant).not.toContain('assistant.id =');
  });

  it('reuses the narrow all-clinician availability permission for Diya and Aiswarya', () => {
    const directGrant = availabilityGrant.split('insert into public.user_permission_grants')[1];
    expect(availabilityGrant).toContain("permission.code = 'clinician.availability.manage_all'");
    expect(availabilityGrant).toContain("profile.designation = 'Assistant Manager'");
    expect(availabilityGrant).toContain("profile.full_name = 'Aiswarya P'");
    expect(directGrant).not.toContain("'doctor_scheduling.manage_doctors'");
  });

  it('authorizes the complete availability workflow, including blocked-period removal, through that canonical permission', () => {
    expect(operationalRls).toContain("public.has_permission('clinician.availability.manage_all')");
    expect(operationalRls).toContain('drop policy if exists "doctor scheduling blocked manage"');
    expect(operationalRls).not.toContain("public.has_permission('finance.manage')");
    expect(schedulingUi).toContain('canManageDoctors || canManageAllAvailability || block.doctor.profile_id === profile?.id');
  });
});
