import { describe, expect, it } from 'vitest';
import { sessionFinanceSummary } from './session-finance';

describe('repeat-session finance summary', () => {
  it('keeps an unpaid session fee entirely outstanding', () => {
    expect(sessionFinanceSummary(1500, [])).toEqual({ fee: 1500, received: 0, outstanding: 1500, receiptIds: [], ledgerIds: [] });
  });

  it('supports payment at creation without treating the remaining fee as received', () => {
    expect(sessionFinanceSummary(1500, [{ id: 'receipt-500', finance_transaction_id: 'ledger-500', amount: 500 }])).toEqual({
      fee: 1500,
      received: 500,
      outstanding: 1000,
      receiptIds: ['receipt-500'],
      ledgerIds: ['ledger-500'],
    });
  });

  it('keeps prior receipts intact while calculating the canonical outstanding balance', () => {
    const priorReceiptIds = ['receipt-1000', 'receipt-1500'];
    const priorLedgerIds = ['ledger-1000', 'ledger-1500'];
    const result = sessionFinanceSummary(3000, [
      { id: priorReceiptIds[0], finance_transaction_id: priorLedgerIds[0], amount: 1000 },
      { id: priorReceiptIds[1], finance_transaction_id: priorLedgerIds[1], amount: 1500 },
    ]);

    expect(result).toEqual({ fee: 3000, received: 2500, outstanding: 500, receiptIds: priorReceiptIds, ledgerIds: priorLedgerIds });
    expect(priorReceiptIds).toEqual(['receipt-1000', 'receipt-1500']);
    expect(priorLedgerIds).toEqual(['ledger-1000', 'ledger-1500']);
  });

  it('reaches fully paid only when cumulative actual payments equal the fee', () => {
    expect(sessionFinanceSummary(3000, [{ amount: 1000 }, { amount: 1500 }, { amount: 500 }]).outstanding).toBe(0);
  });
});
