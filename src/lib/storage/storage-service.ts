import { SupabaseStorageProvider } from './supabase-storage-provider';
export const PATIENT_DOCUMENTS_BUCKET = 'patient-documents';
export const IDEA_ATTACHMENTS_BUCKET = 'idea-attachments';
export function patientStorage(client: any) { return new SupabaseStorageProvider(client, PATIENT_DOCUMENTS_BUCKET); }
export function ideaStorage(client: any) { return new SupabaseStorageProvider(client, IDEA_ATTACHMENTS_BUCKET); }
export function patientDocumentKey(patientId: string, documentId: string, version: number, extension: string) {
  return `patients/${patientId}/documents/${documentId}/v${version}/${crypto.randomUUID()}.${extension}`;
}
export function ideaAttachmentKey(ideaId: string, attachmentId: string, extension: string) {
  return `ideas/${ideaId}/attachments/${attachmentId}/${crypto.randomUUID()}.${extension}`;
}
