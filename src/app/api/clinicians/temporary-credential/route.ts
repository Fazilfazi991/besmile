import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverSupabase } from '@/lib/supabase-server';
import { regenerateClinicianTemporaryCredential } from '@/lib/clinician-temporary-credential';
import { privateCredentialHeaders } from '@/lib/temporary-credential';
import { normalizeClientError } from '@/lib/client-error';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403, headers: privateCredentialHeaders });
    const session = await serverSupabase();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: privateCredentialHeaders });
    const allowed = await session.rpc('has_permission', { permission_code: 'outsourced_clinicians.manage' });
    if (allowed.error || !allowed.data) return NextResponse.json({ error: 'Outsourced manager permission required.' }, { status: 403, headers: privateCredentialHeaders });
    const input = await request.json();
    if (typeof input.doctorId !== 'string' || typeof input.requestId !== 'string') throw new Error('Choose the existing clinician.');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Server credential recovery is unavailable.');
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await regenerateClinicianTemporaryCredential(session, service, input);
    return NextResponse.json({ ...result, onboardingRequired: true }, { headers: privateCredentialHeaders });
  } catch (error) {
    return NextResponse.json({ error: normalizeClientError(error, 'Unable to generate a temporary credential.') }, { status: 400, headers: privateCredentialHeaders });
  }
}
