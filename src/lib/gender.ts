export const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

export type GenderValue = (typeof genderOptions)[number]['value'];

export function normalizeGender(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male') return 'male';
  if (normalized === 'female') return 'female';
  return '';
}

export function genderLabel(value?: string | null) {
  const normalized = normalizeGender(value);
  return genderOptions.find((option) => option.value === normalized)?.label || value || '';
}
