'use client';

import { useState } from 'react';

export function PasswordChangeForm({ forced = false }: { forced?: boolean }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to change your password.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccess('Password changed successfully.');
      if (forced) window.setTimeout(() => window.location.assign('/'), 600);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={forced ? 'card w-full max-w-md p-6' : 'card p-5'}>
      <h2 className="font-bold">Security</h2>
      {forced && <p className="mt-1 text-sm text-slate-600">For security, please create your own password before continuing.</p>}
      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium">Current password
          <input aria-label="Current password" autoComplete="current-password" className="input mt-1" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label className="text-sm font-medium">New password
          <input aria-label="New password" autoComplete="new-password" className="input mt-1" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label className="text-sm font-medium">Confirm new password
          <input aria-label="Confirm new password" autoComplete="new-password" className="input mt-1" type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} />
        </label>
        <p className="text-xs text-slate-500">At least 8 characters, including uppercase, lowercase, and a number.</p>
        {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
        {success && <p className="text-sm text-emerald-700" role="status">{success}</p>}
        <button className="btn btn-primary w-fit" disabled={saving} type="button" onClick={() => void changePassword()}>{saving ? 'Changing password...' : 'Change Password'}</button>
      </div>
    </section>
  );
}
