import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260821140000_chat_mentions_and_read_state.sql'), 'utf8');

type SqlStatement = {
  startLine: number;
  endLine: number;
  text: string;
};

function splitTopLevelSql(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  let dollarQuote: string | null = null;
  let line = 1;
  let startLine = 1;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];

    if (character === '\n') {
      line += 1;
    }

    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = null;
      }
      continue;
    }

    if (quote) {
      if (character === quote && sql[index + 1] === quote) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '-' && sql[index + 1] === '-') {
      const commentEnd = sql.indexOf('\n', index + 2);
      if (commentEnd === -1) break;
      index = commentEnd - 1;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === '$') {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (delimiter) {
        dollarQuote = delimiter;
        index += delimiter.length - 1;
        continue;
      }
    }

    if (character === ';') {
      const rawStatement = sql.slice(start, index + 1);
      const text = rawStatement.trim();
      if (text) {
        const leadingLines = (rawStatement.match(/^\s*/)?.[0].match(/\n/g) ?? []).length;
        statements.push({ startLine: startLine + leadingLines, endLine: line, text });
      }
      start = index + 1;
      startLine = line;
    }
  }

  expect(dollarQuote, 'all dollar-quoted function bodies must terminate').toBeNull();
  expect(quote, 'all quoted literals must terminate').toBeNull();
  expect(sql.slice(start).trim(), 'the final top-level statement must terminate').toBe('');
  return statements;
}

describe('chat mentions and read state migration', () => {
  it('uses normalized mention rows and indexed participant lookups', () => {
    expect(migration).toContain('create table if not exists public.chat_message_mentions');
    expect(migration).toContain('primary key (message_id, profile_id)');
    expect(migration).toContain('chat_mentions_profile_conversation_idx');
  });
  it('enforces membership for mentions and read positions', () => {
    expect(migration).toContain('Mentions must be active participants in this conversation');
    expect(migration).toContain('Only the sender can set message mentions');
    expect(migration).toContain('not public.is_chat_member(target_conversation)');
    expect(migration).toContain('Read position must belong to the conversation');
  });
  it('keeps a per-member high-water mark rather than per-message receipts', () => {
    expect(migration).toContain('last_read_message_id uuid');
    expect(migration).toContain('mark_chat_conversation_read');
  });

  it('keeps every DDL and dollar-quoted function body as an independent top-level statement', () => {
    const statements = splitTopLevelSql(migration);

    expect(statements.map(({ startLine, text }) => [startLine, text.split(/\s+/).slice(0, 3).join(' ').toLowerCase()])).toEqual([
      [1, '-- normalized mentions'],
      [5, 'create table if'],
      [12, 'create index if'],
      [13, 'create index if'],
      [15, 'alter table public.chat_message_mentions'],
      [16, 'create policy "chat'],
      [19, 'create or replace'],
      [33, 'create or replace'],
      [46, 'create or replace'],
      [61, 'create or replace'],
      [72, 'revoke all on'],
      [73, 'grant select on'],
      [74, 'revoke all on'],
      [75, 'revoke all on'],
      [76, 'revoke all on'],
      [77, 'revoke all on'],
      [78, 'grant execute on'],
      [79, 'grant execute on'],
      [80, 'grant execute on'],
      [81, 'alter publication supabase_realtime'],
    ]);
    expect(statements[0].text).toContain('add column if not exists last_read_message_id');
    expect(statements[1].text).toMatch(/primary key \(message_id, profile_id\)\s*\);$/i);
    expect(statements[4].text).toBe('alter table public.chat_message_mentions enable row level security;');
    expect(statements.slice(6, 10).every(({ text }) => text.endsWith('end $$;'))).toBe(true);
  });
});
