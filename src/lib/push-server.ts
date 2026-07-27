import 'server-only';

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { safePushRoute, workspaceForRole } from '@/lib/push-routes';

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushPayload = { notificationId: string; title: string; body: string; route: string; category?: string; priority?: string; tag?: string; requireInteraction?: boolean };

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY && process.env.WEB_PUSH_CONTACT_EMAIL);
}

function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function configureWebPush() {
  if (!configured()) return false;
  webpush.setVapidDetails(`mailto:${process.env.WEB_PUSH_CONTACT_EMAIL}`, process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY!, process.env.WEB_PUSH_VAPID_PRIVATE_KEY!);
  return true;
}

export function pushIsConfigured() { return configured(); }

export async function sendPushToSubscription(subscription: SubscriptionRow, payload: PushPayload) {
  if (!configureWebPush()) return { delivered: false, expired: false, error: 'Push delivery is not configured.' };
  try {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { TTL: 60 });
    return { delivered: true, expired: false, error: null };
  } catch (cause: any) {
    const statusCode = Number(cause?.statusCode || 0);
    return { delivered: false, expired: statusCode === 404 || statusCode === 410, error: statusCode ? `Push provider returned ${statusCode}.` : 'Push delivery failed.' };
  }
}

// Server-only delivery helper for an authenticated webhook, server action, or queue worker.
// It intentionally never throws so normal business actions stay independent from push delivery.
export async function sendPushToUser(input: PushPayload & { userId: string; role: string }) {
  const db = serviceDb();
  if (!db || !configured()) return { attempted: 0, delivered: 0, expired: 0, failed: 0, configured: false };
  const { data: subscriptions } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', input.userId).eq('is_active', true);
  const payload = { ...input, route: safePushRoute(input.route, workspaceForRole(input.role)), tag: input.tag || `notification-${input.notificationId}` };
  const results = await Promise.all((subscriptions || []).map(async (subscription: SubscriptionRow) => {
    const result = await sendPushToSubscription(subscription, payload);
    const update = result.delivered ? { last_used_at: new Date().toISOString(), last_error: null, failure_count: 0 } : result.expired ? { is_active: false, last_error: result.error, failure_count: 1 } : { last_error: result.error, failure_count: 1 };
    await db.from('push_subscriptions').update(update).eq('id', subscription.id);
    return result;
  }));
  return { attempted: results.length, delivered: results.filter(item => item.delivered).length, expired: results.filter(item => item.expired).length, failed: results.filter(item => !item.delivered && !item.expired).length, configured: true };
}
