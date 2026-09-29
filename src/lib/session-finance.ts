export type SessionPayment = { id?: string | null; finance_transaction_id?: string | null; amount?: number | string | null };

export function sessionFinanceSummary(feeValue: number | string | null | undefined, payments: SessionPayment[] = []) {
  const fee = Math.max(0, Number(feeValue || 0));
  const received = payments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount || 0)), 0);
  return {
    fee,
    received,
    outstanding: Math.max(0, fee - received),
    receiptIds: payments.flatMap(payment => payment.id ? [payment.id] : []),
    ledgerIds: payments.flatMap(payment => payment.finance_transaction_id ? [payment.finance_transaction_id] : []),
  };
}
