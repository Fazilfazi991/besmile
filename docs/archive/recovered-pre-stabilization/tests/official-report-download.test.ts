import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('official PDF download paths', () => {
  it('validates status, MIME, non-empty body, and PDF signature in the shared downloader', () => {
    const downloader = readFileSync('src/lib/official-report-download.ts', 'utf8');
    const browser = readFileSync('src/lib/browser-download.ts', 'utf8');
    expect(downloader).toContain("fetch('/api/documents/official/report'");
    expect(downloader).toContain('downloadBrowserFile(response');
    expect(browser).toContain("await blob.slice(0, 4).text() !== '%PDF'");
    expect(browser).toContain('if (!response.ok)');
    expect(browser).toContain('if (!blob.size)');
  });
  it('keeps finance filters and invoice identity in authorized report payloads', () => {
    const finance = readFileSync('src/app/admin/finance/reports/page.tsx', 'utf8');
    const invoice = readFileSync('src/app/admin/finance/invoices/[id]/page.tsx', 'utf8');
    expect(finance).toContain("context: { report: type, from: from || 'all', to: to || 'all' }");
    expect(finance).toContain("filenameSuffix: `${from || 'all'}_${to || 'all'}`");
    expect(invoice).toContain("reportType: 'invoice'");
    expect(invoice).toContain('context: { invoice_id: id, invoice_number: invoice.invoice_number }');
    expect(invoice).toContain('downloadOfficialReport');
  });
});


