import { describe, expect, it } from 'vitest';
import { financeDashboardTransactions } from './finance-dashboard-transactions';

function ledgerDb(records: any[], failureAfter?: number) {
  let calls = 0;
  return { from(table: string) {
    expect(table).toBe('finance_transactions');
    let cursor = ''; let limit = 0; let excludeArchived = false;
    const query: any = {
      select: () => query,
      is: (column: string, value: unknown) => { expect([column, value]).toEqual(['archived_at', null]); excludeArchived = true; return query; },
      order: (column: string) => { expect(column).toBe('id'); return query; },
      limit: (value: number) => { limit = value; return query; },
      gt: (column: string, value: string) => { expect(column).toBe('id'); cursor = value; return query; },
      then: (resolve: (value: unknown) => void) => { calls++; resolve(failureAfter === calls ? { error: new Error('ledger unavailable') } : { data: records.filter(r => r.id > cursor && (!excludeArchived || !r.archived_at)).sort((a,b) => a.id.localeCompare(b.id)).slice(0,limit), error: null }); },
    };
    return query;
  } };
}

describe('finance dashboard ledger pagination', () => {
  it('includes more than the API default cap exactly once and excludes archived rows', async () => {
    const rows = Array.from({ length: 1201 }, (_, n) => ({ id: String(n).padStart(5, '0'), transaction_date: n < 500 ? '2026-10-19' : '2026-10-20', amount: 10, archived_at: null }));
    rows.push({ id: '20000', transaction_date: '2026-10-20', amount: 999, archived_at: '2026-10-21' });
    const result = await financeDashboardTransactions(ledgerDb(rows));
    expect(result).toHaveLength(1201);
    expect(new Set(result.map(row => row.id)).size).toBe(1201);
    expect(result.reduce((sum, row) => sum + row.amount, 0)).toBe(12010);
    expect(result[0].transaction_date).toBe('2026-10-20');
  });

  it('fails closed if any page cannot be read', async () => {
    const rows = Array.from({ length: 600 }, (_, n) => ({ id: String(n).padStart(5, '0'), archived_at: null }));
    await expect(financeDashboardTransactions(ledgerDb(rows, 2))).rejects.toThrow('ledger unavailable');
  });
});
