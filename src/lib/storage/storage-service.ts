import { SupabaseStorageProvider } from './supabase-storage-provider';
export const PATIENT_DOCUMENTS_BUCKET = 'patient-documents';
export function patientStorage(client: any) { return new SupabaseStorageProvider(client, PATIENT_DOCUMENTS_BUCKET); }
export function patientDocumentKey(patientId: string, documentId: string, version: number, extension: string) {
  return `patients/${patientId}/documents/${documentId}/v${version}/${crypto.randomUUID()}.${extension}`;
}
