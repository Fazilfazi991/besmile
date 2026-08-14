import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { passwordChangeValidationMessage } from '@/lib/password-rules';
import { serverSupabase } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const confirmNewPassword = typeof body?.confirmNewPassword === 'string' ? body.confirmNewPassword : '';
  const validation = passwordChangeValidationMessage({ currentPassword, newPassword, confirmNewPassword });
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });

  const session = await serverSupabase();
  const { data: { user } } = await session.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: verificationError } = await verifier.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verificationError) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

  const { error: updateError } = await session.auth.updateUser({ password: newPassword });
  if (updateError) return NextResponse.json({ error: 'Unable to change your password. Please try again.' }, { status: 400 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: profileError } = await admin.from('profiles').update({ must_change_password: false }).eq('id', user.id);
  if (profileError) return NextResponse.json({ error: 'Password changed, but account security could not be completed. Please retry.' }, { status: 500 });

  return NextResponse.json({ success: true });
}
