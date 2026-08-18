import { BUSINESS_TIME_ZONE } from './business-time';

const honorific = /^(?:mr\.?|mrs\.?|ms\.?|miss|dr\.?)$/i;

/** Returns a greeting-safe preferred name from the signed-in profile. */
export function dashboardGreetingName(fullName?: string | null) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (honorific.test(parts[0] || '')) parts.shift();

  const name = parts[0];
  return name && !/^(?:undefined|null)$/i.test(name) ? name : null;
}

export function dashboardGreetingPeriod(now = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const hour = Number(new Intl.DateTimeFormat('en', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now));

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function dashboardGreeting(fullName?: string | null, now = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const period = dashboardGreetingPeriod(now, timeZone);
  const name = dashboardGreetingName(fullName);
  return name ? `${period}, ${name} 👋` : `${period} 👋`;
}
