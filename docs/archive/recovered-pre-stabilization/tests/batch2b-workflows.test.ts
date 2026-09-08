import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Batch 2B workflows', () => {
  it('uses a narrow authorized RPC for chat recipients and persistent reactions', () => {
    const repo = readFileSync('src/lib/employee-repository.ts', 'utf8'); const ui = readFileSync('src/components/chat-hub.tsx', 'utf8'); const sql = readFileSync('supabase/migrations/20260815061542_chat_directory_and_reactions.sql', 'utf8');
    expect(repo).toContain("rpc('chat_recipient_search'"); expect(sql).toContain("p.id <> auth.uid()"); expect(sql).toContain("p.status::text in ('active','intern','probation')"); expect(sql).toContain('chat_message_reactions'); expect(ui).toContain('chat-reaction-picker'); expect(repo).toContain('toggleChatReaction');
  });
  it('confirms an idea update and bounds push pending state', () => {
    const ideas = readFileSync('src/lib/idea-repository.ts', 'utf8'); const push = readFileSync('src/components/browser-push-settings.tsx', 'utf8');
    expect(ideas).toContain("select('id,title,updated_at').single()"); expect(push).toContain('Notification setup timed out'); expect(push).toContain('finally { setBusy(false); }');
  });
  it('preserves archived announcement notification history without a dead link', () => {
    const sql = readFileSync('supabase/migrations/20260815061703_archived_announcement_notification_lifecycle.sql', 'utf8'); expect(sql).toContain("title='Announcement archived'"); expect(sql).toContain('deep_link=null');
  });
});


