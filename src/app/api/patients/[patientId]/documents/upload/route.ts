import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { patientStorage, patientDocumentKey } from '@/lib/storage/storage-service';
import { safeDocumentFilename, validatePatientDocument } from '@/lib/patient-document-rules';
export async function POST(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try { const { patientId } = await params; const db = await serverSupabase(); const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const allowed = await db.rpc('has_permission',{permission_code:'patient_documents.upload'}); if (!allowed.data) return NextResponse.json({error:'Permission denied'},{status:403});
    const form = await request.formData(); const file = form.get('file'); if (!(file instanceof File)) throw new Error('Choose a file to upload.'); const extension = validatePatientDocument(file);
    const name = String(form.get('documentName') || '').trim(); const category = String(form.get('category') || '').trim(); const visibility = String(form.get('visibility') || 'general_staff'); if (!name || !category || !['general_staff','assigned_psychologist','clinical_team','management_only'].includes(visibility)) throw new Error('Complete the required document details.');
    const { data: document, error: insertError } = await db.from('patient_documents').insert({patient_id:patientId,document_name:name,original_filename:safeDocumentFilename(file.name),category,visibility,mime_type:file.type,file_extension:extension,file_size_bytes:file.size,document_date:String(form.get('documentDate') || new Date().toISOString().slice(0,10)),expiry_date:form.get('expiryDate') || null,notes:form.get('notes') || null,uploaded_by:user.id,storage_key:'pending'}).select().single(); if (insertError) throw insertError;
    const key=patientDocumentKey(patientId,document.id,1,extension); try { await patientStorage(db).uploadFile({bucket:'patient-documents',storageKey:key,file,contentType:file.type}); const checksum=Buffer.from(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())).toString('hex'); const {error}=await db.from('patient_documents').update({storage_key:key,checksum,updated_by:user.id}).eq('id',document.id); if(error)throw error; } catch(error) { await db.from('patient_documents').update({deleted_at:new Date().toISOString(),deleted_by:user.id}).eq('id',document.id); throw error; }
    return NextResponse.json({ id: document.id }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 400 }); }
}
