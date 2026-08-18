'use client';

import { useEffect, useRef } from 'react';

export function ConfirmationDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false, pending = false, error = '', onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; pending?: boolean; error?: string; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) { closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const dialog = confirmRef.current?.closest('[role="dialog"]');
      const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')] : [];
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, [open, pending]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" className="card w-full max-w-md p-5 shadow-2xl"><h2 id="confirmation-title" className="text-lg font-bold">{title}</h2><p id="confirmation-description" className="mt-2 text-sm text-slate-600">{description}</p>{error ? <p role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" className="btn border" disabled={pending} onClick={onClose}>{cancelLabel}</button><button ref={confirmRef} type="button" className={`btn ${destructive ? 'border border-rose-700 bg-rose-700 text-white' : 'btn-primary'}`} disabled={pending} onClick={() => void onConfirm()}>{pending ? 'Working…' : confirmLabel}</button></div></section></div>;
}
