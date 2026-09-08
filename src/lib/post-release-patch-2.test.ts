import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const density = readFileSync('src/app/workspace-density.css', 'utf8');
const teams = readFileSync('src/components/chat-hub-fixes.css', 'utf8');

describe('post-release patch 2 regressions', () => {
  it('keeps the colorful shell navigation and compact page headings readable', () => {
    expect(density).toContain('html[data-theme="colorful"] .app-sidebar .nav-section-trigger{color:#c9d1ee}');
    expect(density).toContain('html[data-theme="colorful"] .compact-page-header h1{color:#f5f7ff}');
    expect(density).toContain('html[data-theme="colorful"] .compact-page-header p{color:#b9c5e6}');
    expect(density).toContain('html[data-theme="colorful"] .module-tabs button');
  });

  it('anchors incoming and outgoing message menus to their nearest viewport edge', () => {
    expect(teams).toContain('.chat-hub .chat-message-actions{box-sizing:border-box;right:auto;left:0;max-width:calc(100vw - 32px)}');
    expect(teams).toContain('.chat-hub .chat-message.own .chat-message-actions{right:0;left:auto}');
  });
});
