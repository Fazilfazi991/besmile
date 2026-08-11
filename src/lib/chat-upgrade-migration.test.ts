import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260811150000_chat_company_group_voice.sql",
  ),
  "utf8",
);

describe("company chat and voice migration", () => {
  it("creates exactly one keyed system group and backfills current employees", () => {
    expect(sql).toContain("system_key = 'all_employees'");
    expect(sql).toContain("chat_conversations_system_key_unique");
    expect(sql).toContain(
      "p.status::text in ('active', 'intern', 'probation')",
    );
    expect(sql).toContain(
      "select public.ensure_all_employees_chat_member(p.id)",
    );
  });

  it("automates membership and prevents leaving or managing the system group", () => {
    expect(sql).toContain("sync_all_employees_chat_membership");
    expect(sql).toContain("and not is_system_group");
    expect(sql).toContain("The All Employees group is managed automatically");
  });

  it("keeps chat permission and workforce checks at the database boundary", () => {
    expect(sql).toContain("public.has_permission('chat.use')");
    expect(sql).toContain("public.has_permission('chat.use', p.id)");
    expect(sql).toContain("message_type in ('text', 'attachment', 'voice')");
    expect(sql).toContain(
      "create or replace function public.create_or_get_direct_chat",
    );
    expect(sql).toContain(
      "create or replace function public.create_group_chat",
    );
  });
});
