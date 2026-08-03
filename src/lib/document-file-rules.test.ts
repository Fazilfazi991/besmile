import { describe, expect, it } from 'vitest';
import { documentFileAccept, documentFileValidationMessage } from './document-file-rules';

describe('document file validation', () => {
  it('accepts approved document file types', () => {
    expect(documentFileAccept).toContain('application/pdf');
    expect(documentFileValidationMessage({ name: 'policy.pdf', type: 'application/pdf', size: 1024 })).toBeNull();
    expect(documentFileValidationMessage({ name: 'photo.jpg', type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(documentFileValidationMessage({ name: 'photo.jpeg', type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(documentFileValidationMessage({ name: 'receipt.png', type: 'image/png', size: 1024 })).toBeNull();
    expect(documentFileValidationMessage({ name: 'scan.webp', type: 'image/webp', size: 1024 })).toBeNull();
  });

  it('blocks risky, unsupported, empty and oversized uploads', () => {
    expect(documentFileValidationMessage({ name: 'probe.exe', type: 'application/x-msdownload', size: 100 })).toMatch(/PDF/);
    expect(documentFileValidationMessage({ name: 'empty.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/);
    expect(documentFileValidationMessage({ name: 'large.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(documentFileValidationMessage({ name: '../policy.pdf', type: 'application/pdf', size: 100 })).toMatch(/unsafe/);
  });

  it('blocks extension and MIME mismatch bypass attempts', () => {
    expect(documentFileValidationMessage({ name: 'sample.exe.pdf', type: 'application/pdf', size: 100 })).toMatch(/embedded extension/);
    expect(documentFileValidationMessage({ name: 'sample.pdf.exe', type: 'application/pdf', size: 100 })).toMatch(/matches the file type/);
    expect(documentFileValidationMessage({ name: 'sample.pdf', type: 'text/plain', size: 100 })).toMatch(/PDF/);
    expect(documentFileValidationMessage({ name: 'sample', type: 'application/pdf', size: 100 })).toMatch(/matches the file type/);
    expect(documentFileValidationMessage({ name: 'sample.png', type: 'image/jpeg', size: 100 })).toMatch(/matches the file type/);
  });
});
