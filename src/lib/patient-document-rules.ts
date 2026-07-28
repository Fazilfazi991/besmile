export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf','image/jpeg','image/png'] as const;
export const ALLOWED_DOCUMENT_EXTENSIONS = ['pdf','jpg','jpeg','png'] as const;
export const MAX_PATIENT_DOCUMENT_BYTES = 20 * 1024 * 1024;
export function validatePatientDocument(file: { name: string; type: string; size: number }) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!file.size) throw new Error('Empty files cannot be uploaded.');
  if (file.size > MAX_PATIENT_DOCUMENT_BYTES) throw new Error('Files must be 20 MB or smaller.');
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension as any) || !ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as any)) throw new Error('Only PDF, JPG, JPEG, and PNG files are allowed.');
  const compatible = (extension === 'pdf' && file.type === 'application/pdf') || (['jpg','jpeg'].includes(extension) && file.type === 'image/jpeg') || (extension === 'png' && file.type === 'image/png');
  if (!compatible) throw new Error('The selected file extension does not match its content type.');
  return extension;
}
export function safeDocumentFilename(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180); }
