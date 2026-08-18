import { describe, expect, it } from 'vitest';
import { dashboardGreeting, dashboardGreetingName, dashboardGreetingPeriod } from './dashboard-greeting';

describe('dashboard greeting', () => {
  it('uses the first name from the authenticated profile', () => {
    expect(dashboardGreeting('Fayiz Mohammed', new Date('2026-08-18T08:00:00Z'))).toBe('Good afternoon, Fayiz 👋');
  });

  it('does not render an honorific without a valid name', () => {
    expect(dashboardGreetingName('Mr.')).toBeNull();
    expect(dashboardGreetingName('Ms.')).toBeNull();
    expect(dashboardGreeting('Mr.', new Date('2026-08-18T08:00:00Z'))).toBe('Good afternoon 👋');
  });

  it('removes a stored honorific when a name follows it', () => {
    expect(dashboardGreetingName('Mr. Yousaf')).toBe('Yousaf');
    expect(dashboardGreetingName('Ms Fayiz Mohammed')).toBe('Fayiz');
  });

  it('uses a clean fallback for missing or invalid profile names', () => {
    expect(dashboardGreetingName(null)).toBeNull();
    expect(dashboardGreetingName('   ')).toBeNull();
    expect(dashboardGreetingName('undefined')).toBeNull();
    expect(dashboardGreetingName('null')).toBeNull();
    expect(dashboardGreeting(null, new Date('2026-08-18T08:00:00Z'))).toBe('Good afternoon 👋');
  });

  it('changes periods in the BSmile business timezone', () => {
    expect(dashboardGreetingPeriod(new Date('2026-08-18T01:00:00Z'))).toBe('Good morning');
    expect(dashboardGreetingPeriod(new Date('2026-08-18T08:00:00Z'))).toBe('Good afternoon');
    expect(dashboardGreetingPeriod(new Date('2026-08-18T14:00:00Z'))).toBe('Good evening');
  });
});
