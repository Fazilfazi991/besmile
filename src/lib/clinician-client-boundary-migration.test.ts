import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('external client boundary across deployed patient schemas', () => {
  it('rejects both response decisions for another clinician appointment before journal or status mutation', async () => {
    const db = new PGlite();
    const id='11111111-1111-4111-8111-111111111111';
    const source=readFileSync('supabase/migrations/20261005193612_outsourced_clinician_qualification_hardening.sql','utf8');
    const response=source.slice(source.indexOf('create or replace function public.respond_to_clinician_appointment'),source.indexOf('create or replace function public.current_clinician_id'));
    try {
      await db.exec(`create schema auth;
        create function auth.uid() returns uuid language sql as $$select '${id}'::uuid$$;
        create function public.has_permission(text) returns boolean language sql as $$select true$$;
        create function public.current_clinician_id() returns uuid language sql as $$select '${id}'::uuid$$;
        create function public.external_patient_access(uuid) returns boolean language sql as $$select true$$;
        create table public.patients(id uuid,deleted_at timestamptz,status text);
        create table public.doctor_appointments(id uuid,doctor_id uuid,patient_id uuid,deleted_at timestamptz,status text,clinician_assignment_version bigint);
        create table public.clinician_appointment_responses(request_id uuid);
        insert into patients values('${id}',null,'active');
        insert into doctor_appointments values('${id}','22222222-2222-4222-8222-222222222222','${id}',null,'scheduled',1);`);
      await db.exec(response);
      for(const decision of ['accepted','rejected']) {
        await expect(db.query(`select public.respond_to_clinician_appointment('${id}','${decision}','33333333-3333-4333-8333-333333333333')`)).rejects.toThrow('unavailable to this clinician');
      }
      expect((await db.query<{status:string}>('select status from doctor_appointments')).rows[0].status).toBe('scheduled');
      expect((await db.query('select * from clinician_appointment_responses')).rows).toHaveLength(0);
    } finally {await db.close();}
  }, 30_000);
  it('denies archived, deleted, unrelated and revoked clients while accepting valid explicit assignment', async () => {
    const db = new PGlite();
    const patient = '11111111-1111-4111-8111-111111111111';
    const doctor = '22222222-2222-4222-8222-222222222222';
    const source = readFileSync('supabase/migrations/20261005195701_outsourced_clinician_file_and_manager_qualification.sql', 'utf8');
    const boundary = source.slice(source.indexOf('create or replace function public.external_patient_access'), source.indexOf('create or replace function public.outsourced_clinician_directory'));
    try {
      await db.exec(`create schema auth;
        create function auth.uid() returns uuid language sql as $$select '${doctor}'::uuid$$;
        create table public.patients(id uuid primary key, deleted_at timestamptz, status text default 'active');
        create table public.doctor_appointments(patient_id uuid, doctor_id uuid, deleted_at timestamptz);
        create table public.test_access(allowed boolean, assigned boolean);
        insert into test_access values(true,false);
        create function public.has_permission(text) returns boolean language sql as $$select allowed from public.test_access$$;
        create function public.current_clinician_id() returns uuid language sql as $$select '${doctor}'::uuid$$;
        create function public.patient_is_assigned(uuid,uuid) returns boolean language sql as $$select assigned from public.test_access$$;
        insert into public.patients(id) values('${patient}');
        insert into public.doctor_appointments values('${patient}','${doctor}',null);`);
      await db.exec(boundary);
      const access = async () => (await db.query<{ allowed: boolean }>(`select public.external_patient_access('${patient}') as allowed`)).rows[0].allowed;
      expect(await access()).toBe(true);
      await db.exec("update patients set status='archived'");
      expect(await access()).toBe(false);
      await db.exec("update patients set status='active'; alter table patients add column archived_at timestamptz; update patients set archived_at=now()");
      expect(await access()).toBe(false);
      await db.exec('update patients set archived_at=null,deleted_at=now()');
      expect(await access()).toBe(false);
      await db.exec('update patients set deleted_at=null; update doctor_appointments set deleted_at=now()');
      expect(await access()).toBe(false);
      await db.exec('update test_access set assigned=true');
      expect(await access()).toBe(true);
      await db.exec('update test_access set allowed=false');
      expect(await access()).toBe(false);
    } finally { await db.close(); }
  }, 30_000);
});
