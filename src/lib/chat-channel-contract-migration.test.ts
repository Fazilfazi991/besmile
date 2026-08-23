import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815080253_chat_channel_contract_for_clean_schema.sql'),
  'utf8',
)

describe('clean chat channel contract migration', () => {
  it('adds and backfills the client-required channel identifier on conversations and messages', () => {
    expect(migration).toContain('alter table public.chat_conversations')
    expect(migration).toContain('add column if not exists channel_id uuid')
    expect(migration).toContain('set channel_id = id')
    expect(migration).toContain('alter table public.chat_messages')
    expect(migration).toContain('set channel_id = conversation_id')
    expect(migration).not.toContain('alter column channel_id set not null')
  })
})
