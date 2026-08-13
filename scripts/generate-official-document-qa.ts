import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateOfficialDocument, generateOfficialReport } from '../src/lib/official-document-engine';
import { validateOfficialDocumentInput } from '../src/lib/official-document-types';

const output = resolve(process.cwd(), 'output/pdf');

const samples = [
  {
    filename: 'BSmile_Offer_Letter_QA_Candidate_2026-08-14.pdf',
    input: {
      documentType: 'offer_letter', issueDate: '2026-08-14', relatedName: 'QA Candidate', position: 'Clinical Psychologist',
      department: 'Clinical Services', joiningDate: '2026-09-01', compensation: 'As per approved offer terms',
      body: 'Dear QA Candidate,\n\nWe are pleased to offer you the position of Clinical Psychologist at BSmile - The Mind Studio. Your proposed joining date is 01 September 2026.\n\nThis offer is subject to the employment terms and company policies communicated by the organization. We look forward to welcoming you to the BSmile team.\n\nPlease confirm your acceptance by signing and returning a copy of this letter.',
      signatoryName: 'QA Authorized Signatory', signatoryTitle: 'Director',
    },
  },
  {
    filename: 'BSmile_Policy_Unicode_QA_2026-08-14.pdf',
    input: {
      documentType: 'policy', issueDate: '2026-08-14', title: 'Official Communication Policy', policyCategory: 'Operations',
      body: '1. Purpose\n\nThis policy establishes the approved format for official BSmile communication.\n\n2. Malayalam verification\n\nബിസ്മൈൽ മൈൻഡ് സ്റ്റുഡിയോ ഔദ്യോഗിക രേഖ. മലയാളം അക്ഷരങ്ങൾ വ്യക്തമായി പ്രദർശിപ്പിക്കണം.\n\n3. Scope\n\nThis policy applies to authorized management users who create official documents.',
      signatoryName: 'QA Authorized Signatory', signatoryTitle: 'Director',
    },
  },
  {
    filename: 'BSmile_Policy_Three_Page_QA_2026-08-14.pdf',
    input: {
      documentType: 'policy', issueDate: '2026-08-14', title: 'Three Page Pagination Verification', policyCategory: 'Quality Assurance',
      body: Array.from({ length: 78 }, (_, index) => `Section ${index + 1}\n\nThis quality assurance paragraph verifies safe pagination, repeated branding, sharp digital text, and footer clearance on every page.`).join('\n\n'),
      signatoryName: 'QA Authorized Signatory', signatoryTitle: 'Director',
    },
  },
] as const;

async function main() {
  await mkdir(output, { recursive: true });
  for (const sample of samples) {
    const result = await generateOfficialDocument(validateOfficialDocumentInput(sample.input));
    await writeFile(resolve(output, sample.filename), result.buffer);
    console.log(`${sample.filename}: ${result.pageCount} page(s), ${result.buffer.length} bytes`);
  }
  const adminRows = Array.from({ length: 85 }, (_, index) => ({ created: `2026-08-${String(index % 28 + 1).padStart(2, '0')}`, lead: `QA Lead ${index + 1} with a sufficiently long customer name`, source: index % 2 ? 'Website' : 'Referral', owner: `BSmile Staff ${index % 9 + 1}`, status: index % 3 ? 'Follow-up' : 'Converted' }));
  const admin = await generateOfficialReport({ heading: 'LEADS REPORT', filename: 'BSmile_Leads_Report_QA_2026-08-14.pdf', columns: [{ key: 'created', label: 'Created' }, { key: 'lead', label: 'Lead name', weight: 2 }, { key: 'source', label: 'Source' }, { key: 'owner', label: 'Assigned staff', weight: 1.4 }, { key: 'status', label: 'Status' }], rows: adminRows, period: 'Period: 01 August 2026 - 31 August 2026', filters: ['Scope: authorized CRM records'] });
  await writeFile(resolve(output, 'BSmile_Leads_Report_QA_2026-08-14.pdf'), admin.buffer);
  console.log(`BSmile_Leads_Report_QA_2026-08-14.pdf: ${admin.pageCount} page(s), ${admin.buffer.length} bytes`);

  const financeRows = Array.from({ length: 120 }, (_, index) => ({ date: `2026-08-${String(index % 28 + 1).padStart(2, '0')}`, type: index % 3 ? 'Income' : 'Expense', account: index % 2 ? 'Operating account' : 'Petty cash', category: index % 3 ? 'Clinical services' : 'Operations', description: `QA finance transaction ${index + 1} with long counterparty description`, amount: `₹${((index + 1) * 125).toLocaleString('en-IN')}.00` }));
  const finance = await generateOfficialReport({ heading: 'FINANCE REPORT', filename: 'BSmile_Finance_Report_QA_2026-08-14.pdf', columns: [{ key: 'date', label: 'Date' }, { key: 'type', label: 'Type' }, { key: 'account', label: 'Account' }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description', weight: 1.8 }, { key: 'amount', label: 'Amount', align: 'right' }], rows: financeRows, period: 'Period: 01 August 2026 - 31 August 2026', totals: [{ label: 'Total', value: '₹907,500.00' }] });
  await writeFile(resolve(output, 'BSmile_Finance_Report_QA_2026-08-14.pdf'), finance.buffer);
  console.log(`BSmile_Finance_Report_QA_2026-08-14.pdf: ${finance.pageCount} page(s), ${finance.buffer.length} bytes`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
