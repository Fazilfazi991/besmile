import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260929035313_release_2_chat_channel_compatibility.sql',
  'utf8',
);
const repository = readFileSync('src/lib/employee-repository.ts', 'utf8');
const hub = readFileSync('src/components/chat-hub.tsx', 'utf8');

let db: PGlite | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  other: '22222222-2222-4222-8222-222222222222',
  third: '33333333-3333-4333-8333-333333333333',
};

async function prepare(columnPresent: boolean) {
  db = new PGlite();
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles(
      id uuid primary key,
      is_employee boolean not null,
      status text not null
    );
    create function public.has_permission(permission_code text, target_profile uuid default auth.uid())
    returns boolean language sql stable
      as $$ select permission_code = 'chat.use' and exists(
        select 1 from public.profiles where id = target_profile and is_employee and status in ('active', 'intern', 'probation')
      ) $$;
    create table public.chat_conversations(
      id uuid primary key default gen_random_uuid(),
      title text,
      conversation_type text not null default 'personal',
      created_at timestamptz not null default now(),
      created_by uuid,
      group_admin_id uuid,
      updated_at timestamptz not null default now(),
      description text,
      group_type text
      ${columnPresent ? ', channel_id uuid' : ''}
    );
    create table public.chat_members(
      conversation_id uuid not null references public.chat_conversations(id),
      profile_id uuid not null references public.profiles(id),
      primary key(conversation_id, profile_id)
    );
    ${columnPresent ? 'create table public.chat_channels(id uuid primary key, name text not null);' : ''}
    insert into public.profiles(id, is_employee, status) values
      ('${ids.actor}', true, 'active'),
      ('${ids.other}', true, 'active'),
      ('${ids.third}', true, 'active');
    select set_config('request.jwt.claim.sub', '${ids.actor}', false);
  `);
  await db.exec(migration);
}

describe('chat creation channel compatibility migration', () => {
  it('keeps legacy channel identifiers out of canonical message inserts', () => {
    expect(repository).toContain('delete message.channel_id');
    expect(repository).toContain('if (!message.conversation_id)');
    expect(hub).toContain('active.chat_conversations?.channel_id || active.conversation_id');
    expect(hub).toContain('item.conversation_id === activeRef.current?.conversation_id');
  });

  it('executes direct reuse and group creation on the canonical column-absent layout', async () => {
    await prepare(false);
    const first = await db!.query<{ id: string }>(`select public.create_or_get_direct_chat('${ids.other}') id`);
    const reused = await db!.query<{ id: string }>(`select public.create_or_get_direct_chat('${ids.other}') id`);
    expect(reused.rows[0].id).toBe(first.rows[0].id);

    const group = await db!.query<{ id: string }>(`select public.create_group_chat('QA group', 'fixture', 'project', array['${ids.other}'::uuid, '${ids.third}'::uuid]) id`);
    const members = await db!.query<{ count: number }>(`select count(*)::int count from public.chat_members where conversation_id = '${group.rows[0].id}'`);
    expect(members.rows[0].count).toBe(3);

    const columns = await db!.query<{ count: number }>("select count(*)::int count from information_schema.columns where table_schema='public' and table_name='chat_conversations' and column_name='channel_id'");
    expect(columns.rows[0].count).toBe(0);
  }, 60_000);

  it('is focused compatibility evidence for the inspected column-present layout', async () => {
    await prepare(true);
    const direct = await db!.query<{ id: string }>(`select public.create_or_get_direct_chat('${ids.other}') id`);
    const group = await db!.query<{ id: string }>(`select public.create_group_chat('QA group', 'fixture', 'project', array['${ids.other}'::uuid, '${ids.third}'::uuid]) id`);
    const conversations = await db!.query<{ id: string; channel_id: string }>('select id, channel_id from public.chat_conversations order by created_at, id');
    expect(conversations.rows).toHaveLength(2);
    expect(conversations.rows.every((row) => row.channel_id === row.id)).toBe(true);
    const channels = await db!.query<{ id: string }>('select id from public.chat_channels order by id');
    expect(new Set(channels.rows.map((row) => row.id))).toEqual(new Set([direct.rows[0].id, group.rows[0].id]));
  }, 60_000);

  it('keeps the RPC surface authenticated-only', async () => {
    await prepare(false);
    const privileges = await db!.query<{ public_direct: boolean; anon_direct: boolean; authenticated_direct: boolean; public_group: boolean; anon_group: boolean; authenticated_group: boolean }>(`
      select
        has_function_privilege('public', 'public.create_or_get_direct_chat(uuid)', 'execute') public_direct,
        has_function_privilege('anon', 'public.create_or_get_direct_chat(uuid)', 'execute') anon_direct,
        has_function_privilege('authenticated', 'public.create_or_get_direct_chat(uuid)', 'execute') authenticated_direct,
        has_function_privilege('public', 'public.create_group_chat(text,text,text,uuid[])', 'execute') public_group,
        has_function_privilege('anon', 'public.create_group_chat(text,text,text,uuid[])', 'execute') anon_group,
        has_function_privilege('authenticated', 'public.create_group_chat(text,text,text,uuid[])', 'execute') authenticated_group
    `);
    expect(privileges.rows[0]).toEqual({
      public_direct: false,
      anon_direct: false,
      authenticated_direct: true,
      public_group: false,
      anon_group: false,
      authenticated_group: true,
    });
  }, 60_000);
});
