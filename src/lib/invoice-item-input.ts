export type InvoiceItemDraft = {
  description: string;
  quantity: string;
  rate: string;
};

export type InvoiceItemValue = {
  description: string;
  quantity: number;
  rate: number;
};

export const newInvoiceItemDraft = (): InvoiceItemDraft => ({ description: '', quantity: '1', rate: '0' });

/**
 * Converts only at a calculation or submit boundary.  Blank drafts deliberately
 * remain invalid rather than being silently restored to 0 or 1 while editing.
 */
export function invoiceDraftNumber(value: string) {
  const normalized = value.trim();
  return normalized === '' ? Number.NaN : Number(normalized);
}

export function invoiceDraftValues(items: InvoiceItemDraft[]): InvoiceItemValue[] {
  return items.map((item) => ({
    description: item.description,
    quantity: invoiceDraftNumber(item.quantity),
    rate: invoiceDraftNumber(item.rate),
  }));
}

export function invoiceDraftLineTotal(item: InvoiceItemDraft) {
  const quantity = invoiceDraftNumber(item.quantity);
  const rate = invoiceDraftNumber(item.rate);
  return Number.isFinite(quantity) && Number.isFinite(rate) ? quantity * rate : 0;
}
