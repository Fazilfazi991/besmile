import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync("supabase/migrations/20260907203702_archive_group_chats.sql", "utf8");
const hub = readFileSync("src/components/chat-hub.tsx", "utf8");
describe("Teams group archival", () => {
  it("preserves history and restricts archival to the custom group admin", () => {
    expect(migration).toContain("add column if not exists archived_at");
    expect(migration).not.toContain("delete from public.chat_");
    expect(migration).toContain("group_admin_id = auth.uid()");
    expect(migration).toContain("not is_system_group");
  });
  it("removes archived groups from summaries and hardens the privileged RPC", () => {
    expect(migration).toContain("conversation.archived_at is null");
    expect(migration).toContain("if auth.uid() is null");
    expect(migration).toContain("revoke all on function public.archive_group_chat(uuid) from public, anon");
  });
  it("requires confirmation in the existing group details UI", () => {
    expect(hub).toContain("Archive this group?");
    expect(hub).toContain("isAdmin && !active.chat_conversations.is_system_group");
  });
});
