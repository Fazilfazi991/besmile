export type DocumentExpiryState = 'valid' | 'expiring_soon' | 'expires_today' | 'expired';

export { BUSINESS_TIME_ZONE, businessDateKey } from './business-time';
import { businessDateKey } from './business-time';

export function documentExpiryState(expiryDate?: string | null, today = businessDateKey(), soonDays = 30): DocumentExpiryState | null {
  if (!expiryDate) return null;
  const days = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return 'expired';
  if (days === 0) return 'expires_today';
  return days <= soonDays ? 'expiring_soon' : 'valid';
}

export function documentExpiryLabel(expiryDate?: string | null, today = businessDateKey()) {
  const state = documentExpiryState(expiryDate, today);
  if (!state || !expiryDate) return null;
  const days = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (state === 'expired') return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (state === 'expires_today') return 'Expires today';
  if (state === 'expiring_soon') return `Expires in ${days} days`;
  return 'Valid';
}
