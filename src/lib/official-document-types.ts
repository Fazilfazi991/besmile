export const officialDocumentTypes = [
  { key: 'offer_letter', label: 'Offer Letter', heading: 'OFFER LETTER', relatedLabel: 'Employee / candidate' },
  { key: 'appointment_letter', label: 'Appointment Letter', heading: 'APPOINTMENT LETTER', relatedLabel: 'Employee' },
  { key: 'experience_letter', label: 'Experience Letter', heading: 'EXPERIENCE LETTER', relatedLabel: 'Employee' },
  { key: 'salary_slip', label: 'Salary Slip', heading: 'SALARY SLIP', relatedLabel: 'Employee' },
  { key: 'policy', label: 'Policy', heading: 'POLICY', relatedLabel: 'Policy owner' },
  { key: 'general_report', label: 'General Report', heading: 'GENERAL REPORT', relatedLabel: 'Related record' },
  { key: 'sales_report', label: 'Sales Report', heading: 'SALES REPORT', relatedLabel: 'Related record' },
  { key: 'performance_report', label: 'Performance Report', heading: 'PERFORMANCE REPORT', relatedLabel: 'Employee / team' },
  { key: 'invoice', label: 'Invoice', heading: 'INVOICE', relatedLabel: 'Client' },
  { key: 'payment_statement', label: 'Payment Statement', heading: 'PAYMENT STATEMENT', relatedLabel: 'Employee / vendor' },
  { key: 'custom_official_document', label: 'Custom Official Document', heading: '', relatedLabel: 'Related record' },
] as const;

export type OfficialDocumentType = typeof officialDocumentTypes[number]['key'];

export type OfficialDocumentInput = {
  documentType: OfficialDocumentType;
  customHeading?: string;
  title?: string;
  body: string;
  issueDate: string;
  relatedProfileId?: string;
  relatedName?: string;
  position?: string;
  department?: string;
  joiningDate?: string;
  compensation?: string;
  policyCategory?: string;
  signatoryName?: string;
  signatoryTitle?: string;
};

export type NormalizedOfficialDocument = OfficialDocumentInput & {
  heading: string;
  typeLabel: string;
};

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function validateOfficialDocumentInput(value: unknown): NormalizedOfficialDocument {
  if (!value || typeof value !== 'object') throw new Error('Invalid document data.');
  const raw = value as Record<string, unknown>;
  const config = officialDocumentTypes.find((item) => item.key === raw.documentType);
  if (!config) throw new Error('Select a valid document type.');
  const issueDate = clean(raw.issueDate, 10);
  const body = clean(raw.body, 30_000);
  const customHeading = clean(raw.customHeading, 80);
  const heading = config.key === 'custom_official_document' ? customHeading.toUpperCase() : config.heading;
  const normalized: NormalizedOfficialDocument = {
    documentType: config.key,
    typeLabel: config.label,
    heading,
    customHeading,
    title: clean(raw.title, 140),
    body,
    issueDate,
    relatedProfileId: clean(raw.relatedProfileId, 80),
    relatedName: clean(raw.relatedName, 140),
    position: clean(raw.position, 120),
    department: clean(raw.department, 120),
    joiningDate: clean(raw.joiningDate, 10),
    compensation: clean(raw.compensation, 120),
    policyCategory: clean(raw.policyCategory, 120),
    signatoryName: clean(raw.signatoryName, 120),
    signatoryTitle: clean(raw.signatoryTitle, 120),
  };
  if (!body) throw new Error('Document content is required.');
  if (!isoDate.test(issueDate)) throw new Error('Enter a valid date of issue.');
  if (!heading) throw new Error('Custom documents require a heading.');
  if (config.key === 'offer_letter') {
    if (!normalized.relatedName) throw new Error('Employee or candidate name is required.');
    if (!normalized.position) throw new Error('Position or designation is required.');
    if (!normalized.joiningDate || !isoDate.test(normalized.joiningDate)) throw new Error('Enter a valid joining date.');
  } else if (!normalized.title) {
    throw new Error('Document title is required.');
  }
  return normalized;
}

export function officialDocumentFilename(input: NormalizedOfficialDocument) {
  const target = input.relatedName || input.title || input.heading;
  const safe = (text: string) => text.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'Document';
  return `BSmile_${safe(input.typeLabel)}_${safe(target)}_${input.issueDate}.pdf`;
}
