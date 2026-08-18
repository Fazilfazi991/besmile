import { describe, expect, it } from 'vitest';
import { dashboardGreeting, dashboardGreetingName, dashboardGreetingPeriod } from './dashboard-greeting';

const afternoon = new Date('2026-08-18T08:00:00Z');

describe('dashboard greeting', () => {
  it('uses the preferred first name from the authenticated profile, not its title', () => {
    expect(dashboardGreeting('Mr. Muhammad Faiz AU', afternoon)).toBe('Good afternoon, Muhammad 👋');
    expect(dashboardGreeting('Anagha Pushppan', afternoon)).toBe('Good afternoon, Anagha 👋');
  });

  it('does not render an honorific without a valid name', () => {
    expect(dashboardGreetingName('Mr.')).toBeNull();
    expect(dashboardGreetingName('Ms.')).toBeNull();
    expect(dashboardGreeting('Mr.', afternoon)).toBe('Good afternoon 👋');
  });

  it('supports profiles with a name but no title', () => {
    expect(dashboardGreetingName('Sana KS')).toBe('Sana');
  });

  it('uses a clean fallback for missing or invalid profile names', () => {
    expect(dashboardGreetingName(null)).toBeNull();
    expect(dashboardGreetingName('   ')).toBeNull();
    expect(dashboardGreetingName('undefined')).toBeNull();
    expect(dashboardGreetingName('null')).toBeNull();
    expect(dashboardGreeting(null, afternoon)).toBe('Good afternoon 👋');
  });

  it('uses the current profile on each render, including after an account switch', () => {
    expect(dashboardGreeting('Mr. Muhammad Faiz AU', afternoon)).toContain('Muhammad');
    expect(dashboardGreeting('Dr. Xavier', afternoon)).toContain('Xavier');
  });

  it('changes periods in the BSmile business timezone', () => {
    expect(dashboardGreetingPeriod(new Date('2026-08-18T01:00:00Z'))).toBe('Good morning');
    expect(dashboardGreetingPeriod(afternoon)).toBe('Good afternoon');
    expect(dashboardGreetingPeriod(new Date('2026-08-18T14:00:00Z'))).toBe('Good evening');
  });
});
