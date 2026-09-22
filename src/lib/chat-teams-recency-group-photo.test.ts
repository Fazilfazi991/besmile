import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260922023955_teams_recency_group_photo.sql"), "utf8");
const repository = readFileSync(join(root, "src/lib/employee-repository.ts"), "utf8");
const hub = readFileSync(join(root, "src/components/chat-hub.tsx"), "utf8");

describe("Teams mixed recency migration", () => {
  it("orders by latest message with existing conversation timestamps as fallback and a stable id tie-break", () => {
    expect(migration).toContain("(latest.message ->> 'created_at')::timestamptz");
    expect(migration).toContain("conversation.updated_at");
    expect(migration).toContain("conversation.created_at");
    expect(migration).toContain("desc, conversation.id asc");
    const finalOrder = migration.slice(migration.lastIndexOf("order by coalesce"));
    expect(finalOrder).not.toContain("conversation_type = 'group'");
    expect(finalOrder).not.toContain("is_system_group");
  });

  it("keeps unread and mention counts in the canonical summary", () => {
    expect(migration).toContain("unread_count bigint");
    expect(migration).toContain("mention_count bigint");
    expect(migration).toContain("from public.chat_message_mentions mention");
  });
});

describe("group photo security and lifecycle", () => {
  it("stores only group-scoped paths and authorizes upload/delete by existing group admin", () => {
    expect(migration).toContain("'group-photos'");
    expect(migration).toMatch(/false,\r?\n  5242880/);
    expect(migration).toContain("avatar_path like 'groups/' || id::text || '/%'");
    expect(migration).toContain("conversation.group_admin_id = (select auth.uid())");
    expect(migration).toContain('create policy "group photo member view"');
    expect(migration).toContain("public.is_chat_member(conversation.id)");
    expect(migration).toContain("conversation.id::text = (storage.foldername(name))[2]");
    expect(migration).toContain("conversation.group_admin_id = (select auth.uid())");
    expect(migration).not.toContain("service_role");
    expect(repository).toContain('storage.from("group-photos")');
  });

  it("uses unique objects, commits the new reference before cleanup, and exposes safe errors", () => {
    const upload = repository.slice(repository.indexOf("async uploadGroupPhoto"), repository.indexOf("async removeGroupPhoto"));
    expect(upload).toContain("crypto.randomUUID()");
    expect(upload.indexOf(".update({ avatar_path: path })")).toBeLessThan(upload.indexOf("remove([previousPath])"));
    expect(upload).toContain("Your previous photo is unchanged.");
    expect(upload).toContain("upsert: false");
  });

  it("shows management only for group admins and preserves image fallback behavior", () => {
    expect(hub).toContain("isGroup && isAdmin && !active.chat_conversations.is_system_group");
    expect(hub).toContain('"Add photo"');
    expect(hub).toContain('"Change photo"');
    expect(hub).toContain("Remove photo");
    expect(hub).toContain("onError={() => setSourceIndex((index) => index + 1)}");
  });
});
