import { describe, expect, it } from 'vitest';
import { sessionFinanceSummary } from './session-finance';

describe('repeat-session finance summary', () => {
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
});
