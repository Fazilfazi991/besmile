'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth';
import { signInValidationMessage } from '@/lib/sign-in-validation';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const validationError = signInValidationMessage({ email, password });
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      // Use a full navigation so middleware reads the freshly written auth cookie.
      // The employee resolver also redirects management roles to the admin shell.
      window.location.assign('/employee');
    } catch (caughtError: any) {
      setError(caughtError.message || 'Unable to sign in. Please try again.');
      setBusy(false);
    }
  };

  return <main className="grid min-h-screen place-items-center p-4"><form className="card w-full max-w-md p-8" noValidate onSubmit={submit}><h1 className="text-2xl font-bold">BSmile CRM</h1><p className="mb-6 text-slate-600">Sign in to your workspace.</p><input aria-label="Email" aria-invalid={Boolean(error && (error.includes('Email') || error.includes('email')))} autoComplete="email" className="input mb-3" type="email" placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} /><input aria-label="Password" aria-invalid={Boolean(error && error.includes('Password'))} autoComplete="current-password" className="input" type="password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} />{error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}<button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Signing in...' : 'Sign in'}</button></form></main>;
}
