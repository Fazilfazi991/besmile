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

  it('supports tablet/mobile composition and both workspace themes', () => {
    expect(styles).toContain('@media(max-width:820px)');
    expect(styles).toContain('@media(max-width:600px)');
    expect(styles).toContain('font-size:16px');
    expect(styles).toContain('html[data-theme="colorful"] .genie-page');
    expect(styles).toContain('@media(prefers-reduced-motion:reduce)');
  });

  it('states the privacy boundary in the product UI', () => {
    expect(component).toContain('No client, CRM, Finance, or private profile data is available to Genie.');
    expect(component).toContain('Approved policies only');
  });
});
