import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let db: PGlite;
const owner = '10000000-0000-4000-8000-000000000001';
const director = '10000000-0000-4000-8000-000000000002';
const chairman = '10000000-0000-4000-8000-000000000003';
const unrelated = '10000000-0000-4000-8000-000000000004';
const generalManager = '10000000-0000-4000-8000-000000000005';
const task = '20000000-0000-4000-8000-000000000001';
const report = '30000000-0000-4000-8000-000000000001';
const dailyReport = '40000000-0000-4000-8000-000000000001';

async function asUser(uid: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec('set role authenticated');
}

async function createResponse(uid: string, text = `Response from ${uid}`) {
  await asUser(uid);
  return db.query<{ id: string }>(
    'insert into public.staff_report_responses(task_comment_id,responder_id,response_text) values ($1,$2,$3) returning id',
    [report, uid, text],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create type public.app_role as enum ('chairman','director','general_manager','staff');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.profiles(id uuid primary key, role public.app_role not null, status text not null);
    create function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$
      select role from public.profiles where id=auth.uid()
    $$;
    create table public.tasks(id uuid primary key);
    create table public.task_comments(
      id uuid primary key,
      task_id uuid not null references public.tasks(id) on delete cascade,
      author_id uuid not null references public.profiles(id),
      body text not null,
      created_at timestamptz not null default now()
    );
    create table public.daily_work_updates(
      id uuid primary key, profile_id uuid not null references public.profiles(id), summary text not null
    );
    create table public.audit_logs(
      id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null,
      entity_type text not null, entity_id uuid, before_data jsonb, after_data jsonb,
      created_at timestamptz not null default now()
    );
    grant usage on schema public,auth to authenticated;
    grant select on public.profiles to authenticated;
    insert into public.profiles values
      ('${owner}','staff','active'),
      ('${director}','director','active'),
      ('${chairman}','chairman','active'),
      ('${unrelated}','staff','active'),
      ('${generalManager}','general_manager','active');
    insert into public.tasks values ('${task}');
    insert into public.task_comments(id,task_id,author_id,body) values ('${report}','${task}','${owner}','Staff progress report');
    insert into public.daily_work_updates(id,profile_id,summary) values ('${dailyReport}','${owner}','Daily work report');
  `);
  await db.exec(readFileSync('supabase/migrations/20260926200724_staff_report_private_responses.sql', 'utf8'));
}, 60000);

beforeEach(async () => {
  await db.exec("reset role; truncate public.staff_report_responses,public.audit_logs; update public.profiles set status='active'");
});

afterAll(async () => { await db?.close(); });

describe('private staff report response PostgreSQL authorization', () => {
  it.each([
    ['owner', owner],
    ['Managing Director', director],
    ['Chairman', chairman],
  ])('allows the %s to read the response', async (_label, reader) => {
    await createResponse(director, 'Private direction');
    await asUser(reader);
    expect((await db.query('select response_text from public.staff_report_responses')).rows)
      .toEqual([{ response_text: 'Private direction' }]);
  });

  it.each([
    ['unrelated staff', unrelated],
    ['General Manager', generalManager],
  ])('does not expose the response to %s through list or direct-id reads', async (_label, reader) => {
    const inserted = await createResponse(chairman, 'Chairman response');
    const id = inserted.rows[0].id;
    await asUser(reader);
    expect((await db.query('select * from public.staff_report_responses')).rows).toHaveLength(0);
    expect((await db.query('select * from public.staff_report_responses where id=$1', [id])).rows).toHaveLength(0);
  });

  it('rejects unauthorized direct create and update attempts', async () => {
    const inserted = await createResponse(director, 'Original response');
    const id = inserted.rows[0].id;
    await asUser(unrelated);
    await expect(db.query(
      'insert into public.staff_report_responses(task_comment_id,responder_id,response_text) values ($1,$2,$3)',
      [report, unrelated, 'Forged response'],
    )).rejects.toThrow(/row-level security/);
    expect((await db.query("update public.staff_report_responses set response_text='Stolen' where id=$1 returning id", [id])).rows).toHaveLength(0);
  });

  it('allows only the owner, Managing Director, and Chairman to create responses', async () => {
    await createResponse(owner, 'Owner reply');
    await createResponse(director, 'Director reply');
    await createResponse(chairman, 'Chairman reply');
    await asUser(owner);
    expect((await db.query('select response_text from public.staff_report_responses order by created_at')).rows).toHaveLength(3);
    await asUser(generalManager);
    await expect(db.query(
      'insert into public.staff_report_responses(task_comment_id,responder_id,response_text) values ($1,$2,$3)',
      [report, generalManager, 'Manager reply'],
    )).rejects.toThrow(/row-level security/);
  });

  it('allows each approved responder to update only their own response', async () => {
    const ownerRow = await createResponse(owner, 'Owner draft');
    const directorRow = await createResponse(director, 'Director draft');
    await asUser(owner);
    expect((await db.query("update public.staff_report_responses set response_text='Owner corrected' where id=$1 returning response_text", [ownerRow.rows[0].id])).rows)
      .toEqual([{ response_text: 'Owner corrected' }]);
    expect((await db.query("update public.staff_report_responses set response_text='Owner overwrite' where id=$1 returning id", [directorRow.rows[0].id])).rows).toHaveLength(0);
    await asUser(director);
    expect((await db.query("update public.staff_report_responses set response_text='Director corrected' where id=$1 returning response_text", [directorRow.rows[0].id])).rows)
      .toEqual([{ response_text: 'Director corrected' }]);
  });

  it('blocks inactive approved identities and immutable-field reassignment', async () => {
    await db.exec(`reset role; update public.profiles set status='inactive' where id='${owner}'`);
    await asUser(owner);
    await expect(db.query(
      'insert into public.staff_report_responses(task_comment_id,responder_id,response_text) values ($1,$2,$3)',
      [report, owner, 'Inactive reply'],
    )).rejects.toThrow(/row-level security/);
    await db.exec(`reset role; update public.profiles set status='active' where id='${owner}'`);
    const inserted = await createResponse(owner, 'Stable identity');
    await expect(db.query('update public.staff_report_responses set responder_id=$1 where id=$2', [director, inserted.rows[0].id]))
      .rejects.toThrow(/Response identity cannot be changed/);
  });

  it('audits response metadata without duplicating private text', async () => {
    await createResponse(chairman, 'Do not copy this private body');
    await db.exec('reset role');
    const audit = (await db.query<{ action: string; after_data: Record<string, unknown> }>(
      "select action,after_data from public.audit_logs where entity_type='staff_report_responses'",
    )).rows[0];
    expect(audit.action).toBe('staff_report_response_created');
    expect(JSON.stringify(audit.after_data)).not.toContain('Do not copy this private body');
  });

  it('applies the same owner and executive boundary to daily-work reports', async () => {
    await asUser(director);
    await db.query(
      'insert into public.staff_report_responses(daily_work_update_id,responder_id,response_text) values ($1,$2,$3)',
      [dailyReport, director, 'Daily work response'],
    );
    await asUser(owner);
    expect((await db.query('select response_text from public.staff_report_responses')).rows)
      .toEqual([{ response_text: 'Daily work response' }]);
    await asUser(chairman);
    expect((await db.query('select response_text from public.staff_report_responses')).rows).toHaveLength(1);
    await asUser(unrelated);
    expect((await db.query('select response_text from public.staff_report_responses')).rows).toHaveLength(0);
  });
});
