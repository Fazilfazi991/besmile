export type ConversionPaymentInput = {
  sale_value: string;
  payment_received: string;
  invoice_due_date: string;
  receiving_account: string;
  payment_method: string;
  payment_date: string;
  payment_reference: string;
};

export const conversionBalance = (saleValue: string | number, paymentReceived: string | number) =>
  Math.max(0, Number(saleValue || 0) - Number(paymentReceived || 0));

export function conversionPaymentValidation(
  input: ConversionPaymentInput,
  closingDate: string,
  canRecordPayment: boolean,
) {
  const sale = Number(input.sale_value);
  const received = Number(input.payment_received || 0);
  if (input.sale_value === '' || !Number.isFinite(sale) || sale < 0) return 'Enter a valid sale amount.';
  if (!Number.isFinite(received) || received < 0) return 'Payment received must be zero or greater.';
  if (received > sale) return 'Payment received cannot exceed the sale amount.';
  if (received > 0 && !canRecordPayment) return 'You do not have permission to record a payment.';
  if (received > 0 && !input.receiving_account) return 'Choose the account that received this payment.';
  if (received > 0 && !input.payment_method) return 'Choose a payment method.';
  if (received > 0 && !input.payment_date) return 'Choose the payment date.';
  if (sale - received > 0 && !input.invoice_due_date) return 'Choose a due date for the outstanding balance.';
  if (input.invoice_due_date && closingDate && input.invoice_due_date < closingDate) return 'Due date cannot be earlier than the sale date.';
  return null;
}
