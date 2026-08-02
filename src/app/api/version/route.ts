import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'local',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    deployment: process.env.VERCEL_DEPLOYMENT_ID || null,
    servedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
