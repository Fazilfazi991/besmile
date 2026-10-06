import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  user: { id: 'employee', email_confirmed_at: '2026-10-01T00:00:00Z' } as { id: string; email_confirmed_at: string | null },
  onboardingRequired: true,
  update: vi.fn(), complete: vi.fn(),
}));
vi.mock('@/lib/supabase-server', () => ({ serverSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: fixture.user }, error: null }), updateUser: fixture.update },
  from: () => { const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { onboarding_required: fixture.onboardingRequired }, error: null }) }; return query; },
}) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: fixture.complete }) }));
import { completePasswordOnboarding } from '@/app/onboarding/password/actions';

const form = () => { const data = new FormData(); data.set('password', 'PrivateQAOnly!234'); data.set('confirmation', 'PrivateQAOnly!234'); return data; };
beforeEach(() => {
  process.env.EMPLOYEE_INITIAL_PASSWORD = 'InitialQAOnly!234';
  fixture.user = { id: 'employee', email_confirmed_at: '2026-10-01T00:00:00Z' };
  fixture.onboardingRequired = true;
  fixture.update.mockReset().mockResolvedValue({ error: null });
  fixture.complete.mockReset().mockResolvedValue({ error: null });
});
describe('employee private-password onboarding action', () => {
  it('permits browser navigation only after password and service-managed completion succeed', async () => {
    expect(await completePasswordOnboarding({}, form())).toEqual({ success: true });
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith({ password: 'PrivateQAOnly!234' });
    expect(fixture.complete).toHaveBeenCalledExactlyOnceWith('complete_employee_onboarding', { target_profile: 'employee' });
  });
  it('keeps onboarding required after completion failure and rejects unchanged-password retries', async () => {
    fixture.complete.mockResolvedValue({ error: { code: 'temporary_failure' } });
    const result = await completePasswordOnboarding({}, form());
    expect(result.success).toBeUndefined();
    expect(result.error).toContain('Choose another new password');
    fixture.complete.mockClear();
    fixture.update.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } });
    fixture.complete.mockResolvedValue({ error: null });
    expect((await completePasswordOnboarding({}, form())).success).toBeUndefined();
    expect(fixture.complete).not.toHaveBeenCalled();
  });
  it('does not complete onboarding after a password update failure', async () => {
    fixture.update.mockResolvedValue({ error: { message: 'Password update unavailable' } });
    expect((await completePasswordOnboarding({}, form())).success).toBeUndefined();
    expect(fixture.complete).not.toHaveBeenCalled();
  });
  it('does not change credentials or complete an unverified account', async () => {
    fixture.user.email_confirmed_at = null;
    expect((await completePasswordOnboarding({}, form())).error).toContain('Verify your login email');
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
  });
  it('rejects retention of the initial password before changing Auth or onboarding', async () => {
    const data = form(); data.set('password', process.env.EMPLOYEE_INITIAL_PASSWORD!); data.set('confirmation', process.env.EMPLOYEE_INITIAL_PASSWORD!);
    expect((await completePasswordOnboarding({}, data)).error).toContain('different from the initial credential');
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
  });
  it('leaves credentials untouched when a completed form is replayed', async () => {
    fixture.onboardingRequired = false;
    expect(await completePasswordOnboarding({}, form())).toEqual({ success: true });
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
  });
});
