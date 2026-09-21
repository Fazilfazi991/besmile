import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Colorful Mode attendance actions', () => {
  it('uses the established green primary surface instead of white', () => {
    expect(styles).toContain(
      'html[data-theme="colorful"] .my-attendance-actions .btn-primary{border-color:#006b64;background:#006b64;color:#fff}',
    );
    expect(styles).not.toContain(
      'html[data-theme="colorful"] .my-attendance-actions .btn-primary{border:0;background:#fff',
    );
  });

  it('keeps Standard Mode attendance actions on their existing green token', () => {
    expect(styles).toMatch(
      /(?:^|})\.my-attendance-actions \.btn-primary\{border-color:#006b64;background:#006b64;color:#fff}/,
    );
  });
});
