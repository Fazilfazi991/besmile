'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { serverSupabase } from '@/lib/supabase-server';

export type OnboardingState = { error?: string };

export async function completePasswordOnboarding(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const password = String(form.get('password') || '');
  const confirmation = String(form.get('confirmation') || '');
  if (password.length < 12) return { error: 'Use at least 12 characters.' };
  if (password !== confirmation) return { error: 'The passwords do not match.' };
  if (process.env.EMPLOYEE_INITIAL_PASSWORD && password === process.env.EMPLOYEE_INITIAL_PASSWORD)
    return { error: 'Choose a password different from the initial credential.' };

  const db = await serverSupabase();
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) return { error: 'Your session expired. Sign in again.' };
  if (!user.email_confirmed_at) return { error: 'Verify your login email before changing the initial password.' };
  const { data: profile, error: profileError } = await db.from('profiles').select('onboarding_required').eq('id', user.id).maybeSingle();
  if (profileError || !profile) return { error: 'Unable to verify your employee profile.' };
  if (!profile.onboarding_required) redirect('/');
  const { error: passwordError } = await db.auth.updateUser({ password });
  const alreadyChangedOnPriorAttempt = passwordError
    && /different from the old password/i.test(passwordError.message || '');
  if (passwordError && !alreadyChangedOnPriorAttempt)
    return { error: passwordError.message || 'Unable to update the password.' };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: completionError } = await admin.rpc('complete_employee_onboarding', { target_profile: user.id });
  if (completionError) return { error: 'Password changed, but onboarding could not be completed. Submit the same password again.' };
  redirect('/');
}
