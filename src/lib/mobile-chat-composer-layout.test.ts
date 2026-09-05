import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  resolve(process.cwd(), "src/components/chat-hub-fixes.css"),
  "utf8",
);
const component = readFileSync(
  resolve(process.cwd(), "src/components/chat-hub.tsx"),
  "utf8",
);

describe("mobile chat composer layout", () => {
  it("reserves the fixed mobile navigation inside a bounded dynamic viewport shell", () => {
    expect(styles).toContain(
      ".app-shell:has(.chat-hub){height:100dvh;min-height:100dvh;grid-template-rows:60px minmax(0,1fr);overflow:hidden}",
    );
    expect(styles).toContain(
      "padding:0 8px max(68px,calc(62px + env(safe-area-inset-bottom)))",
    );
    expect(styles).toContain(
      ".employee-shell .app-content>.chat-hub{height:100%;min-height:0;margin-inline:-8px}",
    );
  });

  it("removes the desktop workspace scale from the mobile conversation", () => {
    expect(styles).toContain(
      ".chat-hub .chat-layout{width:100%;height:100%;transform:none}",
    );
  });

  it("shrinks only the message history and keeps the composer in normal flow", () => {
    expect(styles).toContain(
      ".chat-hub .chat-message-panel{display:flex!important;height:100%;min-height:0;flex-direction:column;overflow:hidden}",
    );
    expect(styles).toContain(
      ".chat-hub .chat-messages{min-height:0;flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain}",
    );
    expect(styles).toContain(
      ".chat-hub .chat-composer{position:relative;z-index:2;flex:0 0 auto}",
    );
  });

  it("keeps the existing message, attachment, voice, and send controls mounted", () => {
    expect(component).toContain('className="chat-composer-main"');
    expect(component).toContain('className="chat-attach"');
    expect(component).toContain('className="chat-mic"');
    expect(component).toContain("onSubmit={send}");
    expect(component).toContain("<SendIcon />");
  });
});
