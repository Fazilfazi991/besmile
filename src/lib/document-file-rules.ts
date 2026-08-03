const allowedDocumentTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const suspiciousName = /[<>:"/\\|?*\u0000-\u001f]/;

export function documentFileValidationMessage(file: { name: string; type?: string; size: number }) {
  if (!file.size) return 'Document file cannot be empty.';
  if (file.size > 10 * 1024 * 1024) return 'Document file must be 10 MB or smaller.';
  if (!allowedDocumentTypes.includes(file.type || '')) return 'Upload a PDF, JPG, PNG, or WebP document.';
  if (suspiciousName.test(file.name) || file.name.includes('..')) return 'Document filename contains unsafe characters.';
  return null;
}

export const documentFileAccept = allowedDocumentTypes.join(',');
