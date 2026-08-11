import { describe, expect, it } from "vitest";
import { insertEmojiAtCursor } from "./chat-composer";

describe("chat composer emoji insertion", () => {
  it("inserts at the cursor without sending or replacing the draft", () => {
    expect(insertEmojiAtCursor("Great work everyone", "👏", 6)).toEqual({
      value: "Great 👏work everyone",
      cursor: 8,
    });
  });

  it("replaces only the selected draft range and preserves Unicode", () => {
    expect(insertEmojiAtCursor("Hello team", "😊", 6, 10).value).toBe(
      "Hello 😊",
    );
  });

  it("keeps the caret after a multi-code-unit emoji inserted mid-draft", () => {
    expect(insertEmojiAtCursor("AB", "\u{1F60A}", 1, 1)).toEqual({
      value: "A\u{1F60A}B",
      cursor: 3,
    });
  });
});
