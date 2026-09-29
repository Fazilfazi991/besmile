'use client';

import { useActionState } from 'react';
import { completePasswordOnboarding, type OnboardingState } from './actions';

export function PasswordOnboardingForm({ emailVerified }: { emailVerified: boolean }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completePasswordOnboarding, {});
  return <form action={action} className="card grid w-full max-w-lg gap-4 p-7">
    <div><p className="eyebrow">Secure onboarding</p><h1 className="text-2xl font-bold">Create your private password</h1><p className="mt-2 text-sm text-slate-600">Your initial credential can only open this onboarding step. Verify your email, then choose a private password before entering BSmile.</p></div>
    {!emailVerified && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Open the verification message sent to your login email, then return here.</p>}
    {state.error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{state.error}</p>}
    <label className="text-sm font-medium">New password<input className="input mt-1" name="password" type="password" minLength={12} autoComplete="new-password" required disabled={!emailVerified || pending} /></label>
    <label className="text-sm font-medium">Confirm new password<input className="input mt-1" name="confirmation" type="password" minLength={12} autoComplete="new-password" required disabled={!emailVerified || pending} /></label>
    <button className="btn btn-primary" disabled={!emailVerified || pending}>{pending ? 'Securing account…' : 'Change password and continue'}</button>
  </form>;
}
