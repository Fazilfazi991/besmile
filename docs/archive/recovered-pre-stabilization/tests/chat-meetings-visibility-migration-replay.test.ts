import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815100000_grant_chat_and_meetings_visibility.sql'),
  'utf8',
)

describe('chat and meetings visibility migration clean replay', () => {
  it('compares the two distinct role enums by their textual labels', () => {
    expect(migration).toContain('join public.roles role on role.code::text = profile.role::text')
    expect(migration).not.toContain('join public.roles role on role.code = profile.role::text')
  })
})


