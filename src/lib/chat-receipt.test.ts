import { describe, expect, it } from "vitest";
import { resolveMessageReceipt } from "./chat-receipt";

const resolve = (overrides: Partial<Parameters<typeof resolveMessageReceipt>[0]> = {}) =>
  resolveMessageReceipt({ own: true, recipientProfileIds: ["recipient"], receipts: [], ...overrides });

describe("resolveMessageReceipt", () => {
  it("shows optimistic and failed states before persisted state", () => {
    expect(resolve({ localStatus: "sending" })).toBe("sending");
    expect(resolve({ localStatus: "failed" })).toBe("failed");
  });

  it("uses sent, delivered, then read precedence", () => {
    expect(resolve()).toBe("sent");
    expect(resolve({ receipts: [{ profile_id: "recipient", delivered_at: "2026-09-05" }] })).toBe("delivered");
    expect(resolve({ receipts: [{ profile_id: "recipient", delivered_at: "2026-09-05", read_at: "2026-09-05" }] })).toBe("read");
  });

  it("requires every group recipient to acknowledge", () => {
    const recipientProfileIds = ["a", "b"];
    expect(resolve({ recipientProfileIds, receipts: [{ profile_id: "a", delivered_at: "2026-09-05", read_at: "2026-09-05" }] })).toBe("sent");
    expect(resolve({ recipientProfileIds, receipts: [
      { profile_id: "a", delivered_at: "2026-09-05", read_at: "2026-09-05" },
      { profile_id: "b", delivered_at: "2026-09-05" },
    ] })).toBe("delivered");
  });

  it("does not expose sender receipts on incoming messages", () => {
    expect(resolve({ own: false })).toBeNull();
  });
});
