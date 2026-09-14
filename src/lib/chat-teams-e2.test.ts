import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const hub = read("src/components/chat-hub.tsx");
const repository = read("src/lib/employee-repository.ts");
const styles = read("src/components/chat-hub-fixes.css");
const permissionBoundary = read("supabase/migrations/0059_chat_permission_boundary.sql");
const archiveBoundary = read("supabase/migrations/20260907203702_archive_group_chats.sql");

describe("Teams E2 profile photos", () => {
  it("signs canonical private profile-photo paths without replacing the stored path", () => {
    expect(repository).toContain('from("profile-photos").createSignedUrls(uniquePaths, 300)');
    expect(repository).toContain("photo_url: signed.get(member.profiles.avatar_url) || null");
    expect(repository).toContain("photo_url: signed.get(person.avatar_url) || null");
    expect(repository).toContain("sender:profiles!chat_messages_sender_id_fkey(full_name,avatar_url)");
    expect(repository).not.toContain("getPublicUrl(");
  });

  it("uses the canonical demo fallback and initials after a broken image", () => {
    expect(hub).toContain("resolveEmployeeAvatar(name)");
    expect(hub).toContain("employeeAvatarInitials(name)");
    expect(hub).toContain('onError={() => setSourceIndex((index) => index + 1)}');
    expect(hub).toContain('data-avatar-source={source ? (source === uploaded ? "profile" : "demo") : "initials"}');
  });

  it("renders photos across conversations, headers, messages, mentions, people and members", () => {
    for (const contract of [
      "imageUrl={person?.photo_url}",
      "imageUrl={other(active, profile.id)?.photo_url}",
      "imageUrl={message.sender?.photo_url}",
      "imageUrl={member.profiles?.photo_url}",
      "imageUrl={person.photo_url}",
    ]) expect(hub).toContain(contract);
    expect(styles).toContain(".chat-hub .chat-avatar>img{display:block;width:100%;height:100%;object-fit:cover}");
  });
});

describe("Teams E2 Create Group and responsive composer", () => {
  it("keeps the canonical permission-scoped group RPC and logical archive model", () => {
    expect(permissionBoundary).toContain("if not public.has_permission('chat.use') then");
    expect(permissionBoundary).toContain("group_admin_id");
    expect(permissionBoundary).toContain("auth.uid(), auth.uid()");
    expect(permissionBoundary).toContain("count(distinct x)");
    expect(archiveBoundary).toContain("group_admin_id = auth.uid()");
    expect(archiveBoundary).toContain("not is_system_group");
    expect(archiveBoundary).toContain("archived_at = now()");
  });

  it("provides an accessible, validated dialog with persistent selected-member chips", () => {
    expect(hub).toContain('aria-label="Create group"');
    expect(hub).toContain('role="dialog"');
    expect(hub).toContain('aria-modal="true"');
    expect(hub).toContain('event.key === "Escape"');
    expect(hub).toContain('className="chat-selected-members"');
    expect(hub).toContain('group.title.trim()');
    expect(hub).toContain('group.members.length < 2');
    expect(hub).toContain("Teams could not create this conversation. Please try again.");
  });

  it("uses a single theme-aware mobile composer with 44px controls", () => {
    expect(styles).toContain('html[data-theme="colorful"] .chat-hub .chat-composer{background:#111936}');
    expect(styles).toContain('html[data-theme="colorful"] .chat-hub .chat-composer-main');
    expect(styles).toContain("width:44px!important;min-width:44px!important;height:44px!important");
    expect(styles).toContain("max-height:calc(100dvh - 60px)");
    expect(styles).toContain("overflow-y:auto;overscroll-behavior:contain");
  });
});
