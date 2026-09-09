import { describe, expect, it } from 'vitest';
import { businessMonthKeys, chartAriaLabel, chartTotal, executiveKpiCharts, operationalKpiCharts, ratioChart, trendChart } from './dashboard-kpi-model';

describe('dashboard KPI visualization models', () => {
  it('provides a truthful model for all eight operational KPIs', () => {
    const charts = operationalKpiCharts({ employees: 10, presentToday: 6, onLeave: 1, leads: 8, newLeads: 2, monthlyIncome: 1200, previousIncome: 900, pendingLeave: 3, openTasks: 7, overdueTasks: 2, outstandingInvoices: 4, totalInvoices: 10, salariesPending: 500, salariesTotal: 2000 });
    expect(Object.keys(charts)).toEqual(['employees', 'attendance', 'leads', 'revenue', 'leave', 'tasks', 'invoices', 'payroll']);
    expect(chartTotal(charts.employees)).toBe(10);
    expect(charts.tasks.data).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Overdue', value: 2 }), expect.objectContaining({ label: 'On schedule', value: 5 })]));
  });

  it('provides real historical or constituent models for all five Director KPIs', () => {
    const charts = executiveKpiCharts({ trend: [{ label: 'Aug', revenue: 100, collections: 60 }, { label: 'Sep', revenue: 140, collections: 80 }], activeLeadDistribution: [{ label: 'Qualified', value: 3, color: '#14988c' }], periodConvertedCount: 2, periodLeadCount: 5, overdueOutstanding: 400, outstanding: 1000 });
    expect(Object.keys(charts)).toEqual(['revenue', 'collections', 'leads', 'conversion', 'invoices']);
    expect(charts.revenue.type).toBe('sparkline');
    expect(charts.conversion.data[0].value).toBe(2);
    expect(charts.invoices.data[1].value).toBe(600);
  });

  it('handles zero denominators and sparse history without NaN, Infinity, or invented points', () => {
    const ratio = ratioChart('Empty ratio', 4, 0, 'Part', 'Remainder');
    const sparse = trendChart('Sparse history', [{ label: 'Sep', value: 12, color: '#14988c' }]);
    expect(chartTotal(ratio)).toBe(0);
    expect(chartAriaLabel(ratio)).not.toMatch(/NaN|Infinity/);
    expect(sparse.data).toHaveLength(1);
    expect(sparse.data[0].value).toBe(12);
  });

  it('aggregates month keys in the canonical business timezone', () => {
    const instant = new Date('2026-08-31T20:30:00.000Z');
    expect(businessMonthKeys(instant, 'Asia/Kolkata')).toEqual({ current: '2026-09', previous: '2026-08' });
    expect(businessMonthKeys(instant, 'UTC')).toEqual({ current: '2026-08', previous: '2026-07' });
  });
});
