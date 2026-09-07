import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('approved BSmile mark', () => {
  it('uses the supplied mark for visible branding and application icons', () => {
    expect(existsSync('public/images/bsmile-mark.png')).toBe(true);
    expect(readFileSync('src/components/permission-sidebar.tsx','utf8')).toContain('/images/bsmile-mark.png');
    expect(readFileSync('src/app/layout.tsx','utf8')).toContain("url:'/images/bsmile-mark.png'");
    expect(readFileSync('public/manifest.webmanifest','utf8')).toContain('/images/bsmile-mark.png');
  });
});
