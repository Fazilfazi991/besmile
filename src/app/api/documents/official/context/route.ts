import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { canGenerateOfficialDocuments } from '@/lib/official-document-access';

export async function GET() {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await canGenerateOfficialDocuments(db)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  const [profile, employees, history] = await Promise.all([
    db.from('profiles').select('id,full_name,designation,role').eq('id', user.id).single(),
    db.from('profiles').select('id,full_name,designation,joining_date,department:departments(name)').eq('is_employee', true).eq('workforce_visible', true).neq('role', 'director').in('status', ['active', 'intern', 'probation']).order('full_name').limit(250),
    db.from('documents').select('id,title,category,file_name,created_at,storage_path').like('category', 'Official:%').order('created_at', { ascending: false }).limit(20),
  ]);
  const error = profile.error || employees.error || history.error;
  if (error) {
    console.warn('Official document context load failed', {
      profile: profile.error?.code,
      employees: employees.error?.code,
      history: history.error?.code,
    });
    return NextResponse.json({ error: 'Unable to load document generator data.' }, { status: 500 });
  }
  return NextResponse.json({ profile: profile.data, employees: employees.data || [], history: history.data || [] });
}
