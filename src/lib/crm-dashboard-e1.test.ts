import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CRM_BUSINESS_TIME_ZONE,
  crmDashboardPeriodRange,
  currentCrmBusinessDate,
  lastThirtyCrmDateRange,
  normalizeCrmDashboardSummary,
  sameCrmDateRange,
  shiftCrmDateKey,
  thirtyDayLeadSeries,
  validateCustomCrmRange,
} from './crm-dashboard-e1';

const page = readFileSync('src/app/admin/crm/page.tsx', 'utf8');
const releaseGate = readFileSync('scripts/release-gate.mjs', 'utf8');

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    periodLeads: 3,
    converted: 1,
    contacted: 1,
    assessment: 1,
    daily: [
      { date: '2026-09-01', leads: 1, converted: 0 },
      { date: '2026-09-14', leads: 2, converted: 1 },
    ],
    statuses: [{ name: 'Contacted', count: 3 }],
    sources: [{ name: 'Referral', count: 3 }],
    followups: { due: 1, overdue: 2, upcoming: 3, completed: 4 },
    financeAllowed: false,
    revenue: 0,
    expenses: 0,
    ...overrides,
  };
}

describe('CRM dashboard E1 date model', () => {
  it('uses the canonical Asia/Kolkata business date across a UTC boundary', () => {
    expect(CRM_BUSINESS_TIME_ZONE).toBe('Asia/Kolkata');
    expect(currentCrmBusinessDate(new Date('2026-09-14T18:29:59Z'))).toBe('2026-09-14');
    expect(currentCrmBusinessDate(new Date('2026-09-14T18:30:00Z'))).toBe('2026-09-15');
  });

  it('preserves Today, Monday-based This Week and This Month semantics', () => {
    expect(crmDashboardPeriodRange('today', '2026-09-16')).toEqual({ start: '2026-09-16', end: '2026-09-16' });
    expect(crmDashboardPeriodRange('week', '2026-09-16')).toEqual({ start: '2026-09-14', end: '2026-09-16' });
    expect(crmDashboardPeriodRange('month', '2026-09-16')).toEqual({ start: '2026-09-01', end: '2026-09-16' });
    expect(crmDashboardPeriodRange('week', '2026-09-14')).toEqual({ start: '2026-09-14', end: '2026-09-14' });
  });

  it('recognizes equivalent date ranges so Monday preset changes do not enter a stale loading state', () => {
    const today = crmDashboardPeriodRange('today', '2026-09-14');
    const week = crmDashboardPeriodRange('week', '2026-09-14');
    expect(sameCrmDateRange(today, week)).toBe(true);
    expect(sameCrmDateRange(today, crmDashboardPeriodRange('month', '2026-09-14'))).toBe(false);
    expect(page).toContain('if (sameCrmDateRange(range, nextRange)) return;');
    expect(page).toContain('if (!sameCrmDateRange(range, draftRange))');
    expect(page).toContain('fixed inset-0 z-[120]');
  });

  it('validates missing, impossible, reversed and future custom ranges', () => {
    expect(validateCustomCrmRange({ start: '', end: '2026-09-14' }, '2026-09-14')).toMatch(/both/i);
    expect(validateCustomCrmRange({ start: '2026-02-30', end: '2026-09-14' }, '2026-09-14')).toMatch(/valid calendar/i);
    expect(validateCustomCrmRange({ start: '2026-09-14', end: '2026-09-13' }, '2026-09-14')).toMatch(/on or before/i);
    expect(validateCustomCrmRange({ start: '2026-09-14', end: '2026-09-15' }, '2026-09-14')).toMatch(/future/i);
    expect(validateCustomCrmRange({ start: '2026-09-01', end: '2026-09-14' }, '2026-09-14')).toBe('');
  });
});

describe('CRM dashboard E1 30-day integrity', () => {
  const range = { start: '2026-08-16', end: '2026-09-14' };

  it('builds today plus the preceding 29 consecutive business dates', () => {
    expect(lastThirtyCrmDateRange('2026-09-14')).toEqual(range);
    expect(shiftCrmDateKey(range.start, 29)).toBe(range.end);
  });

  it('truthfully zero-fills valid missing dates and keeps exactly 30 points', () => {
    const raw = fixture({
      periodLeads: 3,
      converted: 0,
      daily: [
        { date: '2026-08-16', leads: 1, converted: 0 },
        { date: '2026-09-14', leads: 2, converted: 0 },
      ],
      statuses: [{ name: 'New', count: 3 }],
      sources: [{ name: 'Referral', count: 3 }],
    });
    const normalized = normalizeCrmDashboardSummary(raw, range);
    const points = thirtyDayLeadSeries(normalized, range);
    expect(points).toHaveLength(30);
    expect(points[0]).toEqual({ date: '2026-08-16', leads: 1, converted: 0 });
    expect(points[1]).toEqual({ date: '2026-08-17', leads: 0, converted: 0 });
    expect(points.at(-1)).toEqual({ date: '2026-09-14', leads: 2, converted: 0 });
    expect(points.reduce((total, point) => total + point.leads, 0)).toBe(normalized.periodLeads);
  });

  it.each([
    ['missing response', null],
    ['duplicate date', fixture({ daily: [{ date: '2026-09-01', leads: 1, converted: 0 }, { date: '2026-09-01', leads: 2, converted: 1 }] })],
    ['date outside requested range', fixture({ daily: [{ date: '2026-08-15', leads: 3, converted: 1 }] })],
    ['lead aggregate mismatch', fixture({ periodLeads: 4 })],
    ['conversion aggregate mismatch', fixture({ converted: 2 })],
    ['status aggregate mismatch', fixture({ statuses: [{ name: 'Contacted', count: 2 }] })],
    ['source aggregate mismatch', fixture({ sources: [{ name: 'Referral', count: 2 }] })],
  ])('rejects %s instead of fabricating a complete zero chart', (_label, response) => {
    expect(() => normalizeCrmDashboardSummary(response, { start: '2026-09-01', end: '2026-09-14' })).toThrow(/could not be verified/i);
  });
});

describe('CRM dashboard E1 component contract', () => {
  it('uses only the aggregate RPC and keeps the fixed chart independent from selected-period changes', () => {
    expect(page.match(/crmDashboardSummary\(/g)).toHaveLength(2);
    expect(page).not.toContain('crmLeads(');
    expect(page).not.toContain('summarizeLegacy');
    expect(page).not.toContain('lead.created_at');
    expect(page).toContain('lastThirtyCrmDateRange(today)');
    expect(page).toContain('[leadRange.end, leadRange.start, leadRetry]');
    expect(page).toContain('[range.end, range.start, summaryRetry]');
  });

  it('suppresses stale summaries and prevents older requests from overwriting newer ranges', () => {
    expect(page).toContain('setSummary(null)');
    expect(page).toContain('request === summaryRequest.current');
    expect(page).toContain('request === leadRequest.current');
    expect(page).toContain('clientSafeError(error');
  });

  it('provides an accessible custom modal and inspectable mobile chart values', () => {
    expect(page).toContain('aria-haspopup="dialog"');
    expect(page).toContain('aria-modal="true"');
    expect(page).toContain('event.key === "Escape"');
    expect(page).toContain('customTrigger.current?.focus()');
    expect(page).toContain('type="range"');
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('View all 30 daily values');
    expect(page).toContain('accessibilityLayer');
  });

  it('includes authenticated E1 browser coverage in the release gate', () => {
    expect(releaseGate).toContain('tests/e2e/crm-dashboard-e1.e2e.ts');
    expect(releaseGate).toContain('BSMILE_QA_DIRECTOR_EMAIL');
  });
});
