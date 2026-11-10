import { describe, expect, it } from 'vitest';
import { dailyWorkRowsForDate, refreshDailyWorkForSelection } from './daily-work-review-state';

describe('daily work review date isolation', () => {
  it('hides a late response for a previous date and restores rows only for the matching date', () => {
    const oldResponse = { date: '2026-10-20', rows: [{ id: 'one' }] };
    const currentResponse = { date: '2026-10-19', rows: [{ id: 'two' }] };
    expect(dailyWorkRowsForDate(oldResponse, '2026-10-19')).toEqual([]);
    expect(dailyWorkRowsForDate(currentResponse, '2026-10-19')).toEqual([{ id: 'two' }]);
  });
  it('discards an old reply refresh even after the reviewer leaves and returns to the same date', async () => {
    let finish!: (rows: string[]) => void;
    let generation = 0;
    const applied: string[][] = [];
    const refresh = refreshDailyWorkForSelection('2026-10-19', generation, () => generation, () => new Promise<string[]>(resolve => { finish = resolve; }), (_date, rows) => applied.push(rows));
    generation += 2;
    finish(['stale']);
    await refresh;
    expect(applied).toEqual([]);
    await refreshDailyWorkForSelection('2026-10-19', generation, () => generation, async () => ['current'], (_date, rows) => applied.push(rows));
    expect(applied).toEqual([['current']]);
  });
});
