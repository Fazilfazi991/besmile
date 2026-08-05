export const ideaStatuses = ['Submitted', 'Under Consideration', 'Implemented', 'On Hold', 'Not Proceeding', 'Archived'] as const;
export type IdeaStatus = typeof ideaStatuses[number];

export const managementIdeaRoles = new Set(['super_admin', 'chairman', 'director', 'general_manager']);
export const ideaAttachmentMaxBytes = 20 * 1024 * 1024;
export const ideaAttachmentMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
];

const allowedExtensionsByType: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
};
const dangerousExtensions = new Set(['exe', 'js', 'mjs', 'cjs', 'html', 'htm', 'svg', 'zip', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'jar', 'msi']);
const suspiciousName = /[<>:"/\\|?*\u0000-\u001f]/;

export const ideaAttachmentAccept = ideaAttachmentMimeTypes.join(',');

export function validateIdeaPayload(payload: { title: string; problem_or_opportunity: string; proposed_solution: string; expected_benefit: string; category_id: string }) {
  const title = payload.title.trim();
  const problem = payload.problem_or_opportunity.trim();
  const solution = payload.proposed_solution.trim();
  const benefit = payload.expected_benefit.trim();
  if (title.length < 5 || title.length > 150) return 'Idea title must be 5 to 150 characters.';
  if (problem.length < 20 || problem.length > 3000) return 'Problem or opportunity must be 20 to 3,000 characters.';
  if (solution.length < 20 || solution.length > 5000) return 'Proposed idea or solution must be 20 to 5,000 characters.';
  if (benefit.length < 10 || benefit.length > 3000) return 'Expected benefit must be 10 to 3,000 characters.';
  if (!payload.category_id) return 'Choose an active category.';
  return null;
}

export function validateIdeaComment(content: string) {
  const text = content.trim();
  if (!text) return 'Comment cannot be empty.';
  if (text.length > 2000) return 'Comment must be 2,000 characters or fewer.';
  return null;
}

export function validateIdeaStatusChange(status: IdeaStatus, reason: string) {
  if (!ideaStatuses.includes(status)) return 'Choose a valid Idea Hub status.';
  if (status === 'Not Proceeding' && (reason.trim().length < 5 || reason.trim().length > 1000)) return 'Add a reason between 5 and 1,000 characters.';
  if (reason.trim().length > 1000) return 'Status note must be 1,000 characters or fewer.';
  return null;
}

export function validateIdeaAttachment(file: { name: string; type?: string; size: number }) {
  const normalizedName = file.name.trim().toLowerCase();
  const parts = normalizedName.split('.').filter(Boolean);
  const finalExtension = parts.at(-1) || '';
  if (!file.size) return 'Attachment cannot be empty.';
  if (file.size > ideaAttachmentMaxBytes) return 'Attachment must be 20 MB or smaller.';
  if (!ideaAttachmentMimeTypes.includes(file.type || '')) return 'Upload a PDF, Word, Excel, PNG, or JPG file.';
  if (!finalExtension || !allowedExtensionsByType[file.type || '']?.includes(finalExtension)) return 'Attachment filename must use an extension that matches the file type.';
  if (parts.slice(0, -1).some(extension => dangerousExtensions.has(extension))) return 'Attachment filename contains an unsafe embedded extension.';
  if (suspiciousName.test(file.name) || file.name.includes('..')) return 'Attachment filename contains unsafe characters.';
  return null;
}

export function safeIdeaFilename(name: string) {
  return name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').slice(0, 160) || 'attachment';
}

export function ideaStatusTone(status: string): 'default' | 'pending' | 'success' | 'danger' | 'info' {
  if (status === 'Implemented') return 'success';
  if (status === 'Not Proceeding' || status === 'Archived') return 'danger';
  if (status === 'On Hold') return 'pending';
  if (status === 'Under Consideration') return 'info';
  return 'default';
}

export function canManageIdeas(profile?: { role?: string | null } | null) {
  return managementIdeaRoles.has(String(profile?.role || '').toLowerCase());
}
