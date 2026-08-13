import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { canGenerateOfficialDocuments } from '@/lib/official-document-access';

export async function POST(request: Request) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await canGenerateOfficialDocuments(db)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const { documentId } = await request.json().catch(() => ({ documentId: '' }));
  if (!documentId) return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
  const result = await db.rpc('record_official_document_download', { document_id: documentId });
  if (result.error) return NextResponse.json({ error: 'Unable to record the download.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
