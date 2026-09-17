import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { officialDocumentAccess } from '@/lib/official-document-access';
import { blockPublicDemoAction } from '@/lib/demo-mode-server';

export async function POST(request: Request) {
  const demoBlock = blockPublicDemoAction();
  if (demoBlock) return demoBlock;
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await officialDocumentAccess(db)).allowedTypes.length) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const { documentId } = await request.json().catch(() => ({ documentId: '' }));
  if (!documentId) return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
  const result = await db.rpc('record_official_document_download', { document_id: documentId });
  if (result.error) return NextResponse.json({ error: 'Unable to record the download.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
