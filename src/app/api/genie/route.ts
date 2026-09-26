import { NextResponse } from 'next/server';
import { canUseGenie } from '@/lib/genie-access';
import { answerPolicyQuestion } from '@/lib/genie-policy';
import { serverSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
  try {
    const db = await serverSupabase();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders });

    const { data: profile } = await db
      .from('profiles')
      .select('status,is_employee')
      .eq('id', user.id)
      .maybeSingle();
    if (!canUseGenie(profile))
      return NextResponse.json({ error: 'Genie is available to active BSmile employees only.' }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as { question?: unknown } | null;
    if (!body || typeof body.question !== 'string' || !body.question.trim())
      return NextResponse.json({ error: 'Enter a policy question.' }, { status: 400, headers: responseHeaders });
    if (body.question.length > 400)
      return NextResponse.json({ error: 'Keep questions under 400 characters.' }, { status: 400, headers: responseHeaders });

    return NextResponse.json(answerPolicyQuestion(body.question), { headers: responseHeaders });
  } catch (error) {
    console.error('Genie policy lookup failed', { message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json(
      { error: 'Genie is temporarily unavailable. Please try again.' },
      { status: 503, headers: responseHeaders },
    );
  }
}
