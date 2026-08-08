import { describe, expect, it } from 'vitest';
import { reportCsv, safeReportCell } from './report-export';
describe('report exports', () => { it('escapes CSV fields and neutralises spreadsheet formulas', () => { expect(safeReportCell('=1+1')).toBe("'=1+1"); expect(reportCsv(['Name'], [{ Name: 'A,"B' }])).toContain('"A,""B"'); }); });
