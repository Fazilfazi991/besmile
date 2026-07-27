'use client';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function vapidKeyBytes(value: string) {
  const normalized = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export async function pushRegistration() {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready.then(() => registration);
}
