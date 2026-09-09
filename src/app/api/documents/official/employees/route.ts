import { NextResponse } from 'next/server';
import { canGenerateOfficialDocuments } from '@/lib/official-document-access';
import { serverSupabase } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await canGenerateOfficialDocuments(db)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  const query = new URL(request.url).searchParams.get('q')?.trim().replace(/[%_,]/g, '') || '';
  if (query.length < 2) return NextResponse.json({ employees: [] });
  const result = await db.from('profiles')
    .select('id,full_name,designation,joining_date,department:departments(name)')
    .eq('is_employee', true)
    .eq('workforce_visible', true)
    .neq('role', 'director')
    .in('status', ['active', 'intern', 'probation'])
    .ilike('full_name', `%${query.slice(0, 80)}%`)
    .order('full_name')
    .limit(20);
  if (result.error) return NextResponse.json({ error: 'Unable to search employees.' }, { status: 500 });
  return NextResponse.json({ employees: result.data || [] });
}
