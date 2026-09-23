import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { officialDocumentAccess } from '@/lib/official-document-access';
import { documentFileValidationMessage } from '@/lib/document-file-rules';
import { officialMomCategory, officialMomType } from '@/lib/official-mom';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await officialDocumentAccess(db);
  if (!access.canUploadMom) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  try {
    const payload = await request.json();
    if (payload.documentType !== officialMomType) return NextResponse.json({ error: 'Only Minutes of Meeting can be uploaded here.' }, { status: 400 });
    const title = String(payload.title || '').trim();
    const description = String(payload.description || '').trim();
    if (!title || title.length > 140) return NextResponse.json({ error: 'Enter a title of 1–140 characters.' }, { status: 400 });
    const storagePath = typeof payload.storagePath === 'string' ? payload.storagePath : '';
    const prefix = `company/${user.id}/mom/`;
    const filename = storagePath.slice(prefix.length);
    if (!storagePath.startsWith(prefix) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}-[^/]+$/.test(filename)) {
      return NextResponse.json({ error: 'Invalid MOM upload path.' }, { status: 400 });
    }
    const storage = db.storage.from('employee-documents');
    // File bytes go directly from browser to private Storage (10 MB supported).
    // Re-read under the user's RLS to validate actual stored size/MIME; never
    // trust client-supplied file metadata or uploader attribution.
    const downloaded = await storage.download(storagePath);
    if (downloaded.error || !downloaded.data) return NextResponse.json({ error: 'Unable to read the uploaded MOM file.' }, { status: 400 });
    const file = { name: filename.slice(37), type: downloaded.data.type, size: downloaded.data.size };
    const validation = documentFileValidationMessage(file);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });
    const existing = await db.from('documents').select('id').eq('storage_path', storagePath).eq('document_type', officialMomType).maybeSingle();
    if (existing.error) return NextResponse.json({ error: 'Unable to check MOM details. Please try again.' }, { status: 400 });
    if (existing.data) return NextResponse.json({ id: existing.data.id });
    const inserted = await db.from('documents').insert({
      title, description, category: officialMomCategory, document_type: officialMomType,
      source_type: 'uploaded', storage_path: storagePath, file_name: file.name,
      mime_type: file.type, file_size: file.size, uploaded_by: user.id,
    }).select('id').single();
    if (inserted.error) {
      return NextResponse.json({ error: 'Unable to save MOM details. Please try again.' }, { status: 400 });
    }
    return NextResponse.json({ id: inserted.data.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to upload the document. Please try again.' }, { status: 400 });
  }
}
