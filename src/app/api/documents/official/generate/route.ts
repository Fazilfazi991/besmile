import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { canGenerateOfficialDocuments } from '@/lib/official-document-access';
import { generateOfficialDocument } from '@/lib/official-document-engine';
import { officialDocumentFilename, validateOfficialDocumentInput } from '@/lib/official-document-types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await canGenerateOfficialDocuments(db)) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  try {
    const payload = await request.json();
    const mode = payload?.mode === 'generate' ? 'generate' : 'preview';
    const input = validateOfficialDocumentInput(payload);
    if (input.relatedProfileId) {
      const related = await db.from('profiles').select('id').eq('id', input.relatedProfileId).maybeSingle();
      if (related.error || !related.data) return NextResponse.json({ error: 'The selected employee is unavailable.' }, { status: 400 });
    }
    const { buffer, pageCount } = await generateOfficialDocument(input);
    const filename = officialDocumentFilename(input);
    let documentId = '';

    if (mode === 'generate') {
      const storagePath = `company/${user.id}/official/${crypto.randomUUID()}-${filename}`;
      const upload = await db.storage.from('employee-documents').upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
      if (upload.error) throw new Error('Unable to store the generated PDF.');
      const baseRecord = {
        title: input.title || `${input.typeLabel} - ${input.relatedName || input.issueDate}`,
        description: `Generated ${input.typeLabel}${input.relatedName ? ` for ${input.relatedName}` : ''}.`,
        category: `Official:${input.typeLabel}`,
        storage_path: storagePath,
        file_name: filename,
        mime_type: 'application/pdf',
        file_size: buffer.length,
        uploaded_by: user.id,
      };
      const record = {
        ...baseRecord,
        source_type: 'official_generated',
        document_type: input.documentType,
        related_profile_id: input.relatedProfileId || null,
        generated_at: new Date().toISOString(),
        page_count: pageCount,
        official_status: 'available',
      };
      let inserted = await db.from('documents').insert(record).select('id').single();
      if (inserted.error && /source_type|document_type|related_profile_id|generated_at|page_count|official_status|schema cache/i.test(inserted.error.message || '')) {
        // A rolling deployment may serve the new application briefly before
        // PostgREST refreshes the additive migration. The existing Documents
        // schema still retains a private, categorized history record.
        inserted = await db.from('documents').insert(baseRecord).select('id').single();
      }
      if (inserted.error) {
        await db.storage.from('employee-documents').remove([storagePath]);
        throw new Error('Unable to save the generated document history. Apply the official document migration and try again.');
      }
      documentId = inserted.data.id;
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${mode === 'preview' ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Document-Filename': encodeURIComponent(filename),
        'X-Document-Id': documentId,
        'X-Document-Pages': String(pageCount),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Document generation failed.' }, { status: 400 });
  }
}
