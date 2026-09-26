import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { officialSignatoryTitle } from './official-signatory-title';
import { displayWorkEmail, executiveTitle } from './profile-display';
import { profileCompletion } from './profile-rules';

describe('client profile and official document follow up', () => {
  it('uses Managing Director only for a verified director signatory', () => {
    expect(officialSignatoryTitle('Director', true)).toBe('Managing Director');
    expect(officialSignatoryTitle('Director', false)).toBe('Director');
    expect(officialSignatoryTitle('Finance Director', true)).toBe('Finance Director');
  });

  it('applies executive labels and ID requirements to the displayed person', () => {
    const profile = { full_name: 'Test', email: 'login@example.com', gender: 'male', department_id: 'department', designation: 'Director', role: 'director' };
    expect(executiveTitle(profile.role, profile.designation)).toBe('Managing Director');
    expect(executiveTitle('chairman', 'Other')).toBe('Chairman');
    expect(profileCompletion(profile).missing).not.toContain('Official ID');
    expect(profileCompletion({ ...profile, role: 'staff' }).missing).toContain('Official ID');
  });

  it('keeps placeholder login identities out of the displayed work email', () => {
    expect(displayWorkEmail({ email: 'test@bsmile.local' })).toBeNull();
    expect(displayWorkEmail({ email: 'test@bsmile.local', work_email: 'confirmed@example.com' })).toBe('confirmed@example.com');
    expect(displayWorkEmail({ email: 'login@example.com' })).toBeNull();
  });

  it('adds optional lead category and work email without changing existing records', async () => {
    const db = new PGlite();
    try {
      await db.exec('create schema if not exists public; create table public.crm_leads (id integer primary key); create table public.profiles (id integer primary key, email text); insert into public.crm_leads values (1); insert into public.profiles values (1, \'login@bsmile.local\');');
      await db.exec(readFileSync('supabase/migrations/20260926120000_lead_category_and_profile_work_email.sql', 'utf8'));
      const leads = await db.query<{ category: string | null }>('select category from public.crm_leads where id = 1');
      const profiles = await db.query<{ email: string; work_email: string | null }>('select email, work_email from public.profiles where id = 1');
      expect(leads.rows[0].category).toBeNull();
      expect(profiles.rows[0]).toEqual({ email: 'login@bsmile.local', work_email: null });
      await db.exec("update public.crm_leads set category = 'Child' where id = 1");
      expect((await db.query<{ category: string }>('select category from public.crm_leads where id = 1')).rows[0].category).toBe('Child');
      await expect(db.exec("update public.crm_leads set category = 'Invalid' where id = 1")).rejects.toThrow();
    } finally { await db.close(); }
  }, 30_000);

  it('guards the staged General Manager work email update and preserves login identity', async () => {
    const db = new PGlite();
    try {
      await db.exec("create table profiles (employee_code text, full_name text, role text, email text, work_email text); insert into profiles values ('A001', 'Muhammad Faiz AU', 'general_manager', 'login@qa.bsmile.local', null)");
      await db.exec(readFileSync('qa-artifacts/staged-general-manager-work-email.sql', 'utf8'));
      const { rows } = await db.query<{ email: string; work_email: string }>('select email, work_email from profiles');
      expect(rows[0]).toEqual({ email: 'login@qa.bsmile.local', work_email: 'bsmile.gm@gmail.com' });
    } finally { await db.close(); }
  }, 30_000);
});
