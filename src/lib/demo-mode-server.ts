import { NextResponse } from 'next/server';
import { isDemoMode, PUBLIC_DEMO_DISABLED_MESSAGE } from '@/lib/demo-mode';

export function blockPublicDemoAction() {
  return isDemoMode()
    ? NextResponse.json({ error: PUBLIC_DEMO_DISABLED_MESSAGE }, { status: 403 })
    : null;
}
