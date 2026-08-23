import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(resolve(process.cwd(), 'src/lib/employee-repository.ts'), 'utf8');

describe('chat reply-parent loading', () => {
  it('keeps the base thread independent of the self-referencing PostgREST embed', () => {
    const page = repository.slice(repository.indexOf('async chatMessagePage'), repository.indexOf('async sendMessage'));
    expect(page).not.toContain('reply_to:chat_messages!chat_messages_reply_to_message_id_fkey');
    expect(page).toContain('const parentIds = [...new Set(rows.map((message: any) => message.reply_to_message_id).filter(Boolean))];');
    expect(page).toContain('.in("id", parentIds);');
  });

  it('uses one batched parent lookup and leaves the base thread usable when enrichment fails', () => {
    const page = repository.slice(repository.indexOf('async chatMessagePage'), repository.indexOf('async sendMessage'));
    expect(page).toContain('if (parentError) return { data: rows, hasMore: rows.length === size };');
    expect(page).toContain('const parentsById = new Map');
    expect(page).toContain('reply_to: parentsById.get(message.reply_to_message_id) || null');
  });
});
