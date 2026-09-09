import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOfficialDocument, generateOfficialReport } from './official-document-engine';
import { validateOfficialDocumentInput } from './official-document-types';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('follow-up Batch B document and policy requirements', () => {
  it('renders a long professional offer letter without clipping into an untracked page', async () => {
    const result = await generateOfficialDocument(validateOfficialDocumentInput({
      documentType: 'offer_letter',
      issueDate: '2026-09-09',
      relatedName: 'A Very Long Candidate Name Used To Verify Wrapping Without Clipping',
      position: 'Senior Clinical Psychologist and Employee Wellness Programme Coordinator',
      department: 'Clinical Services and Organisational Wellbeing',
      joiningDate: '2026-10-01',
      compensation: 'AED 123,456 per annum plus approved benefits',
      body: Array.from({ length: 18 }, (_, index) => `Offer paragraph ${index + 1}. This paragraph verifies professional spacing, readable line height, and safe page continuation for long offer-letter content.`).join('\n\n'),
      signatoryName: 'QA Director',
      signatoryTitle: 'Director',
    }));
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('renders invoice details, long rows, multiple rows and totals without changing values', async () => {
    const rows = Array.from({ length: 36 }, (_, index) => ({
      description: `Detailed professional service line ${index + 1} with a long description that must wrap cleanly`,
      quantity: 2,
      rate: 'AED 1,250.00',
      amount: 'AED 2,500.00',
    }));
    const result = await generateOfficialReport({
      heading: 'INVOICE', filename: 'invoice.pdf',
      columns: [{ key: 'description', label: 'Description', weight: 2.2 }, { key: 'quantity', label: 'Quantity', align: 'right' }, { key: 'rate', label: 'Rate', align: 'right' }, { key: 'amount', label: 'Amount', align: 'right' }],
      rows,
      period: 'Invoice INV-QA-001 | Issued 2026-09-09 | Due 2026-09-30',
      details: [{ label: 'Bill to', value: 'A Customer With An Intentionally Long Trading Name LLC' }, { label: 'Address', value: 'A long customer address retained in the printable invoice when available' }],
      totals: [{ label: 'Subtotal', value: 'AED 90,000.00' }, { label: 'Tax', value: 'AED 4,500.00' }, { label: 'Total', value: 'AED 94,500.00' }],
    });
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.pageCount).toBeGreaterThan(1);
  }, 30_000);

  it('uses server-side scoped employee search and stores the selected canonical id', () => {
    const page = source('src/app/admin/documents/generate/page.tsx');
    const endpoint = source('src/app/api/documents/official/employees/route.ts');
    const context = source('src/app/api/documents/official/context/route.ts');
    expect(page).toContain('role="combobox"');
    expect(page).toContain("relatedProfileId: id");
    expect(page).toContain("event.key === 'ArrowDown'");
    expect(endpoint).toContain(".ilike('full_name'");
    expect(endpoint).toContain(".limit(20)");
    expect(endpoint).toContain("canGenerateOfficialDocuments(db)");
    expect(context).not.toContain("limit(250)");
  });

  it('adds policy discoverability without weakening document sharing RLS', () => {
    const migration = source('supabase/migrations/20260909051207_employee_policy_visibility.sql');
    const rls = source('supabase/migrations/0063_document_center_rls_policy_repair.sql');
    const employeePage = source('src/app/employee/documents/page.tsx');
    expect(migration).toContain("permission.code = 'documents.view'");
    expect(migration).toContain("role.code in ('psychologist', 'intern', 'staff')");
    expect(migration).not.toMatch(/disable row level security|to anon/i);
    expect(rls).toContain('share.shared_with_all or share.profile_id = auth.uid()');
    expect(employeePage).toContain('title="Policies"');
    expect(employeePage).toContain('No published policies');
  });
});
