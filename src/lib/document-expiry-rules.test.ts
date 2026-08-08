import { describe, expect, it } from 'vitest';
import { businessDateKey, documentExpiryLabel, documentExpiryState } from './document-expiry-rules';

describe('document expiry rules', () => {
  it('uses the company business day rather than the browser UTC day', () => {
    expect(businessDateKey(new Date('2026-08-07T21:30:00.000Z'))).toBe('2026-08-08');
  });
  it('labels valid, imminent, today and expired documents consistently', () => {
    expect(documentExpiryState('2026-09-08', '2026-08-08')).toBe('valid');
    expect(documentExpiryState('2026-08-15', '2026-08-08')).toBe('expiring_soon');
    expect(documentExpiryState('2026-08-08', '2026-08-08')).toBe('expires_today');
    expect(documentExpiryLabel('2026-08-07', '2026-08-08')).toBe('Expired 1 day ago');
  });
});
