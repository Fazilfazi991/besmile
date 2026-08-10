export const patientSourceOptions = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'referral', label: 'Referral' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'existing_patient', label: 'Existing Client' },
  { value: 'other', label: 'Other' },
] as const;

const aliases: Record<string, string> = {
  walkin: 'walk_in',
  'walk-in': 'walk_in',
  'walk in': 'walk_in',
  phone: 'phone_call',
  'phone call': 'phone_call',
  whatsapp: 'whatsapp',
  website: 'website',
  'social media': 'social_media',
  social: 'social_media',
  referral: 'referral',
  campaign: 'campaign',
  'existing patient': 'existing_patient',
  other: 'other',
};

export function normalizePatientSource(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/_/g, ' ');
  return patientSourceOptions.some((option) => option.value === raw) ? raw : aliases[key] || '';
}

export function patientSourceLabel(value?: string | null) {
  const normalized = normalizePatientSource(value);
  return patientSourceOptions.find((option) => option.value === normalized)?.label || value || '';
}

export function isLegacyPatientSource(value?: string | null) {
  return Boolean(value && !normalizePatientSource(value));
}
