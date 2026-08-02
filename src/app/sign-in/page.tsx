'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      // Use a full navigation so middleware reads the freshly written auth cookie.
      // The employee resolver also redirects management roles to the admin shell.
      window.location.assign('/employee');
    } catch (caughtError: any) {
      setError(caughtError.message || 'Unable to sign in. Please try again.');
      setBusy(false);
    }
  };

  return <main className="grid min-h-screen place-items-center p-4"><form className="card w-full max-w-md p-8" onSubmit={submit}><h1 className="text-2xl font-bold">BSmile CRM</h1><p className="mb-6 text-slate-600">Sign in to your workspace.</p><input className="input mb-3" type="email" required placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} /><input className="input" type="password" required placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} />{error && <p className="mt-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Signing in...' : 'Sign in'}</button></form></main>;
}
