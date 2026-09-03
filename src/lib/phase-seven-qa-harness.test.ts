import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const harness = readFileSync('scripts/qa-authenticated-release.mjs', 'utf8');
describe('authenticated release QA harness safety', () => {
  it('guards production writes and uses ephemeral sessions', () => {
    expect(harness).toContain('projectRef === productionRef && writesRequested');
    expect(harness).toContain('persistSession: false');
    expect(harness).toContain("signOut({ scope: 'local' })");
  });
  it('loads credentials only from environment variables', () => {
    expect(harness).toContain('process.env[passwordKey]');
    expect(harness).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
  });
});
