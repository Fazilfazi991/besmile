import { NextResponse } from 'next/server';
import { sendPushToUser } from '@/lib/push-server';

// This endpoint is intentionally machine-to-machine only. Configure a Supabase
// Database Webhook on INSERT of public.notifications to call it with this secret.
export async function POST(request: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || request.headers.get('x-push-dispatch-secret') !== secret) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const body = await request.json(); const notification = body?.record || body?.notification || body;
    if (!notification?.id || !notification?.profile_id || !notification?.title || !notification?.body) return NextResponse.json({ error: 'Invalid notification payload.' }, { status: 400 });
    const role = String(notification.metadata?.recipient_role || 'staff');
    const result = await sendPushToUser({ userId: notification.profile_id, role, notificationId: notification.id, title: notification.title, body: notification.body, route: notification.deep_link || '/employee/notifications', category: notification.category || 'system', priority: notification.priority || 'normal', requireInteraction: notification.priority === 'critical' });
    console.log('[PushDispatch] notification', notification.id, result);
    return NextResponse.json(result);
  } catch (error) { console.error('[PushDispatch] failed', error); return NextResponse.json({ error: 'Push dispatch failed.' }, { status: 500 }); }
}
