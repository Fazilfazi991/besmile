const allowedDocumentTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const allowedExtensionsByType: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};
const dangerousExtensions = new Set(['exe', 'js', 'mjs', 'cjs', 'html', 'htm', 'svg', 'zip', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'jar', 'msi']);
const suspiciousName = /[<>:"/\\|?*\u0000-\u001f]/;

export function documentFileValidationMessage(file: { name: string; type?: string; size: number }) {
  const normalizedName = file.name.trim().toLowerCase();
  const parts = normalizedName.split('.').filter(Boolean);
  const finalExtension = parts.at(-1) || '';
  if (!file.size) return 'Document file cannot be empty.';
  if (file.size > 10 * 1024 * 1024) return 'Document file must be 10 MB or smaller.';
  if (!allowedDocumentTypes.includes(file.type || '')) return 'Upload a PDF, JPG, PNG, or WebP document.';
  if (!finalExtension || !allowedExtensionsByType[file.type || '']?.includes(finalExtension)) return 'Document filename must use an extension that matches the file type.';
  if (parts.slice(0, -1).some(extension => dangerousExtensions.has(extension))) return 'Document filename contains an unsafe embedded extension.';
  if (suspiciousName.test(file.name) || file.name.includes('..')) return 'Document filename contains unsafe characters.';
  return null;
}

export const documentFileAccept = allowedDocumentTypes.join(',');
