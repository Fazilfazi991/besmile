import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const button = readFileSync('src/components/page-back-button.tsx', 'utf8');
const density = readFileSync('src/app/workspace-density.css', 'utf8');
const globals = readFileSync('src/app/globals.css', 'utf8');
const sidebar = readFileSync('src/components/permission-sidebar.tsx', 'utf8');
const chat = readFileSync('src/components/chat-hub.tsx', 'utf8');

describe('mobile contextual Back navigation contract', () => {
  it('renders the shared control inside page content with a Lucide chevron', () => {
    expect(button).toContain('className="page-back-navigation print:hidden"');
    expect(button).toContain('<ChevronLeft aria-hidden="true" />');
    expect(button).toContain('href={target.href}');
  });

  it('explicitly keeps the control visible and touch friendly on mobile', () => {
    expect(density).toMatch(/@media\(max-width:900px\)\{[\s\S]*?\.page-back-navigation\{display:block;visibility:visible;min-height:44px;/);
    expect(density).toContain('.page-back-button svg{width:19px;height:19px}');
    expect(density).not.toMatch(/\.page-back-(?:navigation|button)[^{]*\{[^}]*display:none/);
  });

  it('keeps the global header and approved bottom navigation unchanged', () => {
    expect(globals).toContain('.app-topbar{display:flex;height:58px;');
    for (const label of ['Today', 'Tasks', 'Teams', 'Profile', 'All Modules']) {
      expect(sidebar).toContain(`<span>${label}</span>`);
    }
  });

  it('keeps a visible in-context Back control for an open mobile chat conversation', () => {
    expect(chat).toContain('className="chat-back"');
    expect(chat).toContain('<ChevronLeft aria-hidden="true" />');
    expect(chat).toContain('activeRef.current = null; setActive(null);');
  });
});
