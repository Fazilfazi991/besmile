'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      router.replace('/sign-in');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <button className="sidebar-signout" type="button" disabled={busy} onClick={() => void handleSignOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>;
}
