import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260904094410_restore_chat_message_reactions_canonical.sql',
  'utf8',
).toLowerCase();

describe('canonical chat message reactions migration', () => {
  it('restores the application table contract with RLS', () => {
    expect(sql).toContain('create table if not exists public.chat_message_reactions');
    expect(sql).toContain('alter table public.chat_message_reactions enable row level security');
    expect(sql).toContain('primary key (message_id, profile_id, emoji)');
  });

  it('requires membership for every supported operation', () => {
    expect(sql.match(/public\.is_chat_member\(\(/g)).toHaveLength(3);
    expect(sql).toContain('for select');
    expect(sql).toContain('for insert');
    expect(sql).toContain('for delete');
  });

  it('limits mutations to the authenticated user and grants no update', () => {
    expect(sql.match(/profile_id = \(select auth\.uid\(\)\)/g)).toHaveLength(2);
    expect(sql).toContain('grant select, insert, delete on table public.chat_message_reactions to authenticated');
    expect(sql).not.toMatch(/grant\s+update/);
    expect(sql).not.toMatch(/\bto\s+anon\b[\s\S]*?using\s*\(\s*true\s*\)/);
  });
});
