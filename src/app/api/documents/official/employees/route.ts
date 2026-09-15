import { NextResponse } from 'next/server';
import { officialDocumentAccess } from '@/lib/official-document-access';
import { serverSupabase } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await officialDocumentAccess(db);
  if (!access.allowedTypes.length) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  const query = new URL(request.url).searchParams.get('q')?.trim().replace(/[%_,]/g, '') || '';
  if (query.length < 2) return NextResponse.json({ employees: [] });
  if (!access.manager) {
    const result = await db.rpc('search_official_document_employees', { search_text: query.slice(0, 80) });
    if (result.error) return NextResponse.json({ error: 'Unable to search employees.' }, { status: 500 });
    return NextResponse.json({ employees: (result.data || []).map((employee: any) => ({
      id: employee.id,
      full_name: employee.full_name,
      designation: employee.designation,
      joining_date: employee.joining_date,
      department: employee.department_name ? { name: employee.department_name } : null,
    })) });
  }
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
