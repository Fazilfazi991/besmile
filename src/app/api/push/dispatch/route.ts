import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sendPushToUser } from '@/lib/push-server';

function matchesSecret(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false;
  const suppliedDigest = createHash('sha256').update(supplied).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

// This endpoint is machine-to-machine only. The notifications trigger reads
// its credential from Vault; this route reads accepted values server-side.
export async function POST(request: Request) {
  const supplied = request.headers.get('x-push-dispatch-secret');
  const authorized = matchesSecret(supplied, process.env.PUSH_DISPATCH_SECRET)
    || matchesSecret(supplied, process.env.PUSH_DISPATCH_SECRET_NEXT);
  if (!authorized) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const body = await request.json(); const notification = body?.record || body?.notification || body;
    if (!notification?.id || !notification?.profile_id || !notification?.title || !notification?.body) return NextResponse.json({ error: 'Invalid notification payload.' }, { status: 400 });
    const role = String(notification.metadata?.recipient_role || 'staff');
    const result = await sendPushToUser({ userId: notification.profile_id, role, notificationId: notification.id, title: notification.title, body: notification.body, route: notification.deep_link || '/employee/notifications', category: notification.category || 'system', priority: notification.priority || 'normal', requireInteraction: notification.priority === 'critical' });
    return NextResponse.json(result);
  } catch { console.error('[PushDispatch] failed'); return NextResponse.json({ error: 'Push dispatch failed.' }, { status: 500 }); }
}
