import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { ideaStorage } from '@/lib/storage/storage-service';

export async function GET(_request: Request, { params }: { params: Promise<{ ideaId: string; attachmentId: string }> }) {
  try {
    const { ideaId, attachmentId } = await params;
    const db = await serverSupabase();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: attachment, error } = await db.from('idea_attachments').select('*').eq('id', attachmentId).eq('idea_id', ideaId).is('deleted_at', null).single();
    if (error || !attachment) return NextResponse.json({ error: 'Attachment unavailable.' }, { status: 404 });
    const url = await ideaStorage(db).createSignedDownloadUrl(attachment.storage_key, 120);
    await db.from('idea_activity_logs').insert({ idea_id: ideaId, action_type: 'attachment_downloaded', actor_employee_id: user.id, metadata: { attachment_id: attachmentId } });
    return NextResponse.json({ url, expiresIn: 120 });
  } catch {
    return NextResponse.json({ error: 'Unable to prepare attachment access.' }, { status: 400 });
  }
}
