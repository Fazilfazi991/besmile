import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260905120000_chat_delivery_read_receipts.sql"), "utf8");

describe("chat delivery and read receipt migration", () => {
  it("keeps receipt writes scoped to the authenticated conversation member", () => {
    expect(migration).toContain("profile_id = (select auth.uid())");
    expect(migration).toContain("public.is_chat_member(target_conversation)");
    expect(migration).toContain("message.sender_id <> auth.uid()");
    expect(migration).not.toContain("service_role");
  });

  it("allows senders to read only receipts for their own visible messages", () => {
    expect(migration).toContain("message.sender_id = (select auth.uid())");
    expect(migration).toContain("public.is_chat_member(message.conversation_id)");
  });

  it("does not acknowledge deleted or expired messages", () => {
    expect(migration).toContain("message.deleted_at is null");
    expect(migration).toContain("message.expired_at is null");
  });
});
