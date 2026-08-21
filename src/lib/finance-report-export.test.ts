import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reportsPage = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/reports/page.tsx'), 'utf8');

describe('finance report CSV export', () => {
  it('uses the shared validated download path and exposes export failure state', () => {
    expect(reportsPage).toContain('import { downloadReportCsv } from "@/lib/report-export"');
    expect(reportsPage).toContain('await downloadReportCsv');
    expect(reportsPage).toContain('Generating CSV…');
    expect(reportsPage).toContain('setError');
  });
});
