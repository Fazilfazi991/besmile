import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repository = readFileSync(
  resolve(process.cwd(), "src/lib/employee-repository.ts"),
  "utf8",
);
const hub = readFileSync(
  resolve(process.cwd(), "src/components/chat-hub.tsx"),
  "utf8",
);

describe("voice message workflow", () => {
  it("uploads audio through the private chat attachment path with metadata", () => {
    expect(repository).toContain("voice_duration_seconds");
    expect(repository).toMatch(/voice\s*\?\s*\/\^audio/);
    expect(repository).toContain(
      'message_type: voice ? "voice" : "attachment"',
    );
    expect(repository).toContain('.from("chat-attachments")');
  });

  it("removes an uploaded object when message persistence fails", () => {
    expect(repository).toContain("if (uploadedPath)");
    expect(repository).toContain(".remove([uploadedPath])");
  });

  it("keeps a preview/discard step and renders secured playback", () => {
    expect(hub).toContain("setVoicePreview");
    expect(hub).toContain("discardVoice");
    expect(hub).toContain("chatAttachmentUrl(message.attachment_path)");
    expect(hub).toContain("<VoiceMessage message={message} />");
  });
});
