import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reportCsv, safeReportCell } from './report-export';
describe('report exports', () => {
  it('escapes CSV fields and neutralises spreadsheet formulas', () => { expect(safeReportCell('=1+1')).toBe("'=1+1"); expect(reportCsv(['Name'], [{ Name: 'A,"B' }])).toContain('"A,""B"'); });
  it('keeps object URLs alive long enough for browser download handoff', () => {
    const source = readFileSync('src/lib/report-export.ts', 'utf8');
    expect(source).toContain("import { downloadBlob } from './browser-download'");
    expect(source).toContain("type: 'array'");
    expect(source).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
});
