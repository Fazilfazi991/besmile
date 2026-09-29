import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const component = readFileSync(resolve(process.cwd(), 'src/components/genie-chat.tsx'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/components/genie-chat.css'), 'utf8');

describe('Genie chat experience', () => {
  it('includes starter questions, loading state, citations, and the unsupported-answer state', () => {
    expect(component).toContain('STARTER_QUESTIONS');
    expect(component).toContain('Checking the approved policies…');
    expect(component).toContain('Policy sources');
    expect(component).toContain("payload.status");
    expect(styles).toContain('.genie-message.is-not_found');
  });

  it('keeps message order and sends every reply to the server before generic small talk handling', () => {
    expect(component).toContain('setMessages((current) => [...current, userMessage');
    expect(component).toContain('thread.scrollTop = thread.scrollHeight');
    expect(component).toContain('if (messages.length === 1 && !loading) return;');
    expect(component).toContain('isNearThreadEnd.current');
    expect(component).toContain('onScroll={trackThreadPosition}');
    expect(component).not.toContain('genieAcknowledgementReply(trimmed)');
    expect(component).toContain("fetch('/api/genie'");
  });

  it('supports tablet/mobile composition and both workspace themes', () => {
    expect(styles).toContain('@media(max-width:820px)');
    expect(styles).toContain('@media(max-width:600px)');
    expect(styles).toContain('font-size:16px');
    expect(styles).toContain('.genie-chat-panel{height:100%;min-height:0}');
    expect(styles).toContain('html[data-theme="colorful"] .genie-page');
    expect(styles).toContain('@media(prefers-reduced-motion:reduce)');
  });

  it('fills the authenticated shell without guessed heights or an outer page scrollbar', () => {
    expect(styles).toContain('.app-shell:has(.genie-page){height:100dvh;min-height:0;overflow:hidden}');
    expect(styles).toContain('.app-shell:has(.genie-page) .app-content{display:flex;min-height:0;flex:1;flex-direction:column;overflow:hidden}');
    expect(styles).toContain('.genie-thread{min-height:0;overflow-y:auto');
    expect(styles).toContain('scroll-padding-block:22px');
    expect(styles).not.toContain('height:calc(100dvh - 118px)');
    expect(styles).not.toContain('min-height:430px');
  });

  it('places the existing mobile navigation after Genie instead of overlaying it', () => {
    expect(styles).toContain('.app-shell:has(.genie-page)>.app-main{order:1');
    expect(styles).toContain('.app-shell:has(.genie-page)>.mobile-bottom-nav{position:relative');
    expect(styles).toContain('order:2');
    expect(styles).toContain('padding-bottom:max(5px,env(safe-area-inset-bottom))');
    expect(styles).toContain('.app-shell:has(.genie-page) .app-content{padding-bottom:var(--workspace-pad)}');
  });

  it('states the privacy boundary in the product UI', () => {
    expect(component).toContain('No client, CRM, Finance, or private profile data is available to Genie.');
    expect(component).toContain('Approved policies only');
  });
});
