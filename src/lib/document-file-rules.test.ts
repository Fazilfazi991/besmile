import { describe, expect, it } from 'vitest';
import { documentFileAccept, documentFileValidationMessage } from './document-file-rules';

describe('document file validation', () => {
  it('accepts approved document file types', () => {
    expect(documentFileAccept).toContain('application/pdf');
    expect(documentFileValidationMessage({ name: 'policy.pdf', type: 'application/pdf', size: 1024 })).toBeNull();
    expect(documentFileValidationMessage({ name: 'receipt.png', type: 'image/png', size: 1024 })).toBeNull();
  });

  it('blocks risky, unsupported, empty and oversized uploads', () => {
    expect(documentFileValidationMessage({ name: 'probe.exe', type: 'application/x-msdownload', size: 100 })).toMatch(/PDF/);
    expect(documentFileValidationMessage({ name: 'empty.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/);
    expect(documentFileValidationMessage({ name: 'large.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(documentFileValidationMessage({ name: '../policy.pdf', type: 'application/pdf', size: 100 })).toMatch(/unsafe/);
  });
});
