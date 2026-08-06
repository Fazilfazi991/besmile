import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverSupabase } from '@/lib/supabase-server';
import { ideaAttachmentKey, IDEA_ATTACHMENTS_BUCKET } from '@/lib/storage/storage-service';
import { safeIdeaFilename, validateIdeaAttachment, validateIdeaPayload } from '@/lib/idea-rules';

const extensionOf = (name: string) => name.toLowerCase().split('.').filter(Boolean).at(-1) || '';

function cleanupClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  let ideaId: string | undefined;
  let attachmentKey: string | undefined;
  try {
    const db = await serverSupabase();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: canCreate, error: permissionError } = await db.rpc('has_permission', { permission_code: 'ideas.create' });
    if (permissionError) throw permissionError;
    if (!canCreate) return NextResponse.json({ error: 'Permission denied.' }, { status: 403 });

    const form = await request.formData();
    const payload = {
      title: String(form.get('title') || ''),
      problem_or_opportunity: String(form.get('problem_or_opportunity') || ''),
      proposed_solution: String(form.get('proposed_solution') || ''),
      expected_benefit: String(form.get('expected_benefit') || ''),
      category_id: String(form.get('category_id') || ''),
    };
    const payloadError = validateIdeaPayload(payload);
    if (payloadError) throw new Error(payloadError);
    const file = form.get('file');
    if (file !== null && !(file instanceof File)) throw new Error('Choose a valid attachment.');
    if (file instanceof File) {
      const fileError = validateIdeaAttachment(file);
      if (fileError) throw new Error(fileError);
    }

    const { data: profile, error: profileError } = await db.from('profiles').select('id,department_id').eq('id', user.id).single();
    if (profileError || !profile) throw profileError || new Error('Your profile could not be loaded.');
    const { data: category, error: categoryError } = await db.from('idea_categories').select('id').eq('id', payload.category_id).eq('is_active', true).is('deleted_at', null).maybeSingle();
    if (categoryError) throw categoryError;
    if (!category) throw new Error('Choose an active Idea Hub category.');

    const { data: idea, error: ideaError } = await db.from('ideas').insert({ ...payload, submitted_by: user.id, submitter_department_id: profile.department_id || null, status: 'Submitted' }).select('id').single();
    if (ideaError) throw ideaError;
    ideaId = idea.id;

    if (file instanceof File) {
      const attachmentId = crypto.randomUUID();
      const extension = extensionOf(file.name);
      attachmentKey = ideaAttachmentKey(idea.id, attachmentId, extension);
      const { error: metadataError } = await db.from('idea_attachments').insert({
        id: attachmentId,
        idea_id: idea.id,
        uploaded_by: user.id,
        original_file_name: safeIdeaFilename(file.name),
        storage_key: attachmentKey,
        mime_type: file.type,
        file_extension: extension,
        file_size: file.size,
      });
      if (metadataError) throw metadataError;
      const { error: storageError } = await db.storage.from(IDEA_ATTACHMENTS_BUCKET).upload(attachmentKey, file, { contentType: file.type, upsert: false });
      if (storageError) {
        console.error('Idea attachment upload failed', { bucket: IDEA_ATTACHMENTS_BUCKET, storageKey: attachmentKey, code: storageError.name, status: (storageError as any).statusCode, message: storageError.message });
        throw new Error('IDEA_ATTACHMENT_UPLOAD_FAILED');
      }
    }

    return NextResponse.json({ id: idea.id }, { status: 201 });
  } catch (error) {
    const cleanup = cleanupClient();
    if (attachmentKey) await cleanup.storage.from(IDEA_ATTACHMENTS_BUCKET).remove([attachmentKey]);
    if (ideaId) await cleanup.from('ideas').delete().eq('id', ideaId);
    const message = error instanceof Error ? error.message : 'Unable to submit idea.';
    return NextResponse.json({ error: message === 'IDEA_ATTACHMENT_UPLOAD_FAILED' ? 'The attachment could not be uploaded. Please try again or submit the idea without the attachment.' : message }, { status: 400 });
  }
}
