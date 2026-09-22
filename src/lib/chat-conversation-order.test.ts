import { describe, expect, it } from "vitest";
import { applyGroupPhoto, applyLatestConversationMessage, orderConversationsByActivity } from "./chat-conversation-order";

const conversation = (id: string, type: "group" | "personal", latest?: string, updated = "2026-09-22T08:00:00.000Z") => ({
  conversation_id: id,
  unread_count: 0,
  latest_message: latest ? { id: `message-${id}`, conversation_id: id, sender_id: "other", created_at: latest } : null,
  chat_conversations: { id, conversation_type: type, created_at: updated, updated_at: updated },
});

describe("conversation activity ordering", () => {
  it("interleaves groups and direct messages solely by canonical activity", () => {
    const rows = orderConversationsByActivity([
      conversation("group-a", "group", "2026-09-22T10:00:00.000Z"),
      conversation("dm-b", "personal", "2026-09-22T10:05:00.000Z"),
      conversation("group-c", "group", "2026-09-22T10:10:00.000Z"),
    ]);
    expect(rows.map((row) => row.conversation_id)).toEqual(["group-c", "dm-b", "group-a"]);
  });

  it("uses conversation timestamps for empty chats and conversation id for stable ties", () => {
    const rows = orderConversationsByActivity([
      conversation("b", "group", undefined, "2026-09-22T10:00:00.000Z"),
      conversation("a", "personal", undefined, "2026-09-22T10:00:00.000Z"),
      conversation("newest", "personal", undefined, "2026-09-22T10:05:00.000Z"),
    ]);
    expect(rows.map((row) => row.conversation_id)).toEqual(["newest", "a", "b"]);
  });

  it("moves a conversation exactly once when realtime delivers a newer message", () => {
    const initial = orderConversationsByActivity([
      conversation("group-a", "group", "2026-09-22T10:00:00.000Z"),
      conversation("dm-b", "personal", "2026-09-22T10:05:00.000Z"),
    ]);
    const updated = applyLatestConversationMessage(initial, {
      id: "new-message",
      conversation_id: "group-a",
      sender_id: "other",
      created_at: "2026-09-22T10:10:00.000Z",
    }, "viewer");
    expect(updated.map((row) => row.conversation_id)).toEqual(["group-a", "dm-b"]);
    expect(new Set(updated.map((row) => row.conversation_id)).size).toBe(2);
    expect(updated[0].unread_count).toBe(1);
  });

  it("ignores an out-of-order realtime event", () => {
    const initial = [conversation("group-a", "group", "2026-09-22T10:10:00.000Z")];
    const updated = applyLatestConversationMessage(initial, {
      id: "older-message",
      conversation_id: "group-a",
      sender_id: "other",
      created_at: "2026-09-22T10:00:00.000Z",
    }, "viewer");
    expect(updated[0].latest_message?.id).toBe("message-group-a");
    expect(updated[0].unread_count).toBe(0);
  });
});

describe("group photo state", () => {
  it("updates and clears only the selected group", () => {
    const rows = [conversation("group-a", "group"), conversation("dm-b", "personal")];
    const added = applyGroupPhoto(rows, "group-a", "groups/group-a/photo.png", "signed-photo");
    expect(added[0].chat_conversations).toMatchObject({ avatar_path: "groups/group-a/photo.png", photo_url: "signed-photo" });
    expect(added[1]).toEqual(rows[1]);
    const removed = applyGroupPhoto(added, "group-a", null, null);
    expect(removed[0].chat_conversations).toMatchObject({ avatar_path: null, photo_url: null });
  });
});
