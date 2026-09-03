import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260814063306_staff_managed_outsourced_psychologist_sessions.sql'),'utf8');
const lifecycle=readFileSync(resolve(process.cwd(),'supabase/migrations/20260814143000_outsourced_clinician_payable_sync.sql'),'utf8');
const scheduling=readFileSync(resolve(process.cwd(),'src/components/doctor-scheduling.tsx'),'utf8');
const repository=readFileSync(resolve(process.cwd(),'src/lib/doctor-scheduling-repository.ts'),'utf8');
describe('staff-managed outsourced psychologist sessions',()=>{
  it('authorizes only RBAC-approved internal users to submit a completed online outsourced session',()=>{expect(sql).toContain("public.has_permission('online_psychologists.manage')");expect(sql).toContain("submitted_by = (select auth.uid())");expect(sql).toContain("appointment.status='completed'");expect(sql).toContain("appointment.consultation_type='online'");expect(sql).toContain("clinician.clinician_type='outsourced'");});
  it('does not require an outsourced clinician auth profile or grant finance settlement',()=>{expect(sql).not.toContain('clinician.profile_id=(select auth.uid())');expect(sql).not.toContain('psychologist_payments.settle');expect(sql).toContain("('Chairman'), ('Director'), ('General Manager')");});
  it('uses the completed-appointment lifecycle instead of a duplicate client-side submission',()=>{expect(repository).toContain("'online_psychologists.manage'");expect(lifecycle).toContain("if new.status='completed' then perform public.create_psychologist_session_payable(new.id); end if;");expect(lifecycle).toContain('create trigger psychologist_appointment_payable_lifecycle');expect(scheduling).not.toContain('Submit session record');expect(scheduling).not.toContain("selected.doctor?.profile_id === profile?.id");});
  it('keeps the clinician-management flow account-free for outsourced clinicians',()=>{expect(scheduling).toContain("clinician_type: 'outsourced', profile_id: null");expect(scheduling).toContain('external clinician record; an account is only needed for internal clinician self-service');});
});
