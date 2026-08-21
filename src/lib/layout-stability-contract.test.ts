import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const stylesheet = readFileSync(resolve(process.cwd(), 'src/app/layout-stability.css'), 'utf8');
describe('layout stability contract', () => {
  it('keeps document scrolling stable and blocks page-level horizontal overflow', () => { expect(stylesheet).toContain('scrollbar-gutter: stable'); expect(stylesheet).toContain('overflow-x: clip'); expect(stylesheet).toContain('min-inline-size: 0'); });
  it('defines standard, wide-data, and workspace content variants', () => { expect(stylesheet).toContain('.page-standard'); expect(stylesheet).toContain('.page-wide'); expect(stylesheet).toContain('.page-workspace'); expect(stylesheet).toContain(".app-content:has(table[class*='min-w-'])"); });
  it('contains table scrollers and viewport-bound dialogs', () => { expect(stylesheet).toContain('overscroll-behavior-inline: contain'); expect(stylesheet).toContain("[role='dialog']"); expect(stylesheet).toContain('max-block-size: min(90dvh, 900px)'); });
  it('prevents mobile input auto-zoom without disabling browser zoom', () => { expect(stylesheet).toContain('font-size: 16px'); expect(stylesheet).not.toContain('zoom:'); expect(stylesheet).not.toContain('transform: scale'); });
});
