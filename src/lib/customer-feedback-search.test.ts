import { describe, expect, it } from 'vitest';

const customerFeedbackSource = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('../components/customer-feedback.tsx', import.meta.url), 'utf8'));

describe('customer feedback search', () => {
  it('indexes the visible customer, staff, service, and response fields', () => {
    expect(customerFeedbackSource).toContain('[item.customerName, item.staffMember, item.service, item.message, ...Object.values(item.fields)]');
  });
});
