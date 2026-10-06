import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverSupabase } from '@/lib/supabase-server';
import { provisionExternalClinician } from '@/lib/clinician-provisioning';
import { normalizeClientError } from '@/lib/client-error';

export async function POST(request: Request) {
  try {
    const session = await serverSupabase();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const allowed = await session.rpc('has_permission', { permission_code: 'outsourced_clinicians.manage' });
    if (allowed.error || !allowed.data) return NextResponse.json({ error: 'Outsourced manager permission required.' }, { status: 403 });
    const input = await request.json();
    if (typeof input.doctorId !== 'string' || typeof input.email !== 'string' || typeof input.requestId !== 'string'
      || !input.fields || typeof input.fields !== 'object') throw new Error('Complete the clinician account details.');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Server account provisioning is unavailable.');
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await provisionExternalClinician(session, service, input, process.env.EMPLOYEE_INITIAL_PASSWORD);
    return NextResponse.json({ ...result, onboardingRequired: true });
  } catch (error) {
    return NextResponse.json({ error: normalizeClientError(error, 'Unable to provision this clinician.') }, { status: 400 });
  }
}
