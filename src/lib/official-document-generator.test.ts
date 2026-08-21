import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOfficialDocument, generateOfficialReport } from './official-document-engine';
import { officialDocumentFilename, officialDocumentTypes, validateOfficialDocumentInput } from './official-document-types';
import { officialReportSpecs, validateOfficialReportPayload } from './official-report-types';

const offer = {
  documentType: 'offer_letter',
  issueDate: '2026-08-14',
  relatedName: 'QA Candidate',
  position: 'Psychologist',
  department: 'Clinical Services',
  joiningDate: '2026-09-01',
  body: 'We are pleased to offer you this position.\n\nPlease confirm your acceptance.',
  signatoryName: 'QA Director',
  signatoryTitle: 'Director',
};

describe('official document generator', () => {
  it('configures every Batch 1 document family with automatic headings', () => {
    expect(officialDocumentTypes.map((item) => item.key)).toEqual(expect.arrayContaining([
      'offer_letter', 'appointment_letter', 'experience_letter', 'salary_slip', 'policy', 'general_report',
      'sales_report', 'performance_report', 'invoice', 'payment_statement', 'custom_official_document',
    ]));
    expect(validateOfficialDocumentInput(offer).heading).toBe('OFFER LETTER');
    expect(validateOfficialDocumentInput({ ...offer, documentType: 'policy', title: 'Information Security', policyCategory: 'Operations' }).heading).toBe('POLICY');
  });

  it('rejects incomplete offer letters and creates clean filenames', () => {
    expect(() => validateOfficialDocumentInput({ ...offer, relatedName: '' })).toThrow(/name is required/i);
    expect(officialDocumentFilename(validateOfficialDocumentInput(offer))).toBe('BSmile_Offer_Letter_QA_Candidate_2026-08-14.pdf');
  });

  it('renders searchable Unicode content and 3+ branded A4 pages through one engine', async () => {
    const Malayalam = 'ബിസ്മൈൽ മൈൻഡ് സ്റ്റുഡിയോ ഔദ്യോഗിക രേഖ. മലയാളം അക്ഷരങ്ങൾ വ്യക്തമായി പ്രദർശിപ്പിക്കണം.';
    const longBody = Array.from({ length: 95 }, (_, index) => `Section ${index + 1}\n\nThis is a long-form quality assurance paragraph. ${Malayalam}`).join('\n\n');
    const result = await generateOfficialDocument(validateOfficialDocumentInput({ ...offer, documentType: 'policy', title: 'Unicode and pagination policy', body: longBody }));
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.buffer.length).toBeGreaterThan(100_000);
    expect(result.pageCount).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('enforces direct API authorization and audited private storage metadata', () => {
    const generateRoute = readFileSync(resolve(process.cwd(), 'src/app/api/documents/official/generate/route.ts'), 'utf8');
    const contextRoute = readFileSync(resolve(process.cwd(), 'src/app/api/documents/official/context/route.ts'), 'utf8');
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260813195922_official_document_generator.sql'), 'utf8');
    for (const route of [generateRoute, contextRoute]) {
      expect(route).toContain('db.auth.getUser()');
      expect(route).toContain('canGenerateOfficialDocuments(db)');
      expect(route).toContain("status: 403");
    }
    expect(generateRoute).toContain("storage.from('employee-documents')");
    expect(generateRoute).toContain("source_type: 'official_generated'");
    expect(migration).toContain('official_document_generated');
    expect(migration).toContain('official_document_downloaded');
    expect(migration).toContain('revoke all on function public.official_document_audit_event()');
    expect(migration).not.toContain("'body'");
  });

  it('maps existing report families to automatic headings and exact permission groups', () => {
    expect(officialReportSpecs.finance_all.heading).toBe('PROFIT & LOSS REPORT');
    expect(officialReportSpecs.attendance.heading).toBe('ATTENDANCE REPORT');
    expect(officialReportSpecs.invoice.permissions).toEqual(['invoices.view', 'invoices.manage']);
    expect(officialReportSpecs.payroll.permissions).toEqual(['payroll.view', 'payroll.manage']);
    const parsed = validateOfficialReportPayload({ reportType: 'finance_income', columns: [{ key: 'amount', label: 'Amount', align: 'right' }], rows: [{ amount: 1250 }], period: 'August 2026' });
    expect(parsed.heading).toBe('INCOME REPORT');
    expect(parsed.filename).toContain('BSmile_INCOME_REPORT');
  });

  it('renders long report tables with repeated headers, totals and safe multi-page flow', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ date: `2026-08-${String(index % 28 + 1).padStart(2, '0')}`, description: `Quality assurance transaction ${index + 1} with a long description`, amount: `₹${(index + 1) * 125}.00` }));
    const result = await generateOfficialReport({ heading: 'FINANCE REPORT', filename: 'qa.pdf', columns: [{ key: 'date', label: 'Date' }, { key: 'description', label: 'Description', weight: 2.5 }, { key: 'amount', label: 'Amount', align: 'right' }], rows, period: '01 August 2026 - 31 August 2026', totals: [{ label: 'Total', value: '₹907,500.00' }] });
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.pageCount).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('protects the report endpoint and keeps the redesigned Finance Reports CSV-based', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/documents/official/report/route.ts'), 'utf8');
    const operational = readFileSync(resolve(process.cwd(), 'src/components/operational-reports.tsx'), 'utf8');
    const finance = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/reports/page.tsx'), 'utf8');
    const invoice = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/invoices/[id]/page.tsx'), 'utf8');
    const payroll = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/payroll/[id]/page.tsx'), 'utf8');
    expect(route).toContain('db.auth.getUser()');
    expect(route).toContain('canGenerateOfficialReport(db, input.reportType)');
    expect(route).toContain('record_official_report_generation');
    for (const file of [operational, invoice, payroll]) {
      expect(file).toContain('downloadOfficialReport');
      expect(file).not.toContain('window.print()');
    }
    expect(finance).toContain('downloadReportCsv');
    expect(finance).not.toContain('window.print()');
  });
});
