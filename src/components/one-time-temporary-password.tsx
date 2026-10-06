'use client';
import { useState } from 'react';

export function OneTimeTemporaryPassword({ password, onDismiss }: { password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(password); setCopied(true); setError(''); }
    catch { setError('Copy was unavailable. Allow clipboard access and try again.'); }
  }
  return <section className="card space-y-3 border-amber-300 p-5" aria-label="One-time temporary password">
    <h2 className="text-lg font-semibold">Temporary login password</h2>
    <p>This temporary password will not be shown again.</p>
    <p className="text-sm">Give it privately to this clinician. They must choose a private password at first sign-in.</p>
    <label className="block">Temporary password<input className="input mt-1 font-mono" type="password" readOnly value={password} autoComplete="off" spellCheck={false} /></label>
    <div className="flex flex-wrap gap-3"><button className="btn border" type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy password'}</button><button className="btn border" type="button" onClick={onDismiss}>Dismiss password</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
