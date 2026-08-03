import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reportsPage = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/reports/page.tsx'), 'utf8');

describe('finance report CSV export', () => {
  it('uses an attached download anchor and delayed blob URL cleanup', () => {
    expect(reportsPage).toContain('document.body.appendChild(anchor)');
    expect(reportsPage).toContain('anchor.click()');
    expect(reportsPage).toContain('anchor.remove()');
    expect(reportsPage).toContain('setTimeout(() => URL.revokeObjectURL(url), 0)');
  });
});
