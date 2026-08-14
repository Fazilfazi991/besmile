export const ideaStatuses = ['submitted', 'under_review', 'approved', 'in_progress', 'implemented', 'rejected'] as const;
export type IdeaStatus = typeof ideaStatuses[number];
export const ideaPriorities = ['low', 'medium', 'high', 'critical'] as const;
export type IdeaPriority = typeof ideaPriorities[number];

export const ideaAttachmentMaxBytes = 20 * 1024 * 1024;
export const ideaAttachmentMimeTypes = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg'];
const extensions: Record<string,string[]> = {'application/pdf':['pdf'],'application/msword':['doc'],'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx'],'image/png':['png'],'image/jpeg':['jpg','jpeg']};
const dangerous = new Set(['exe','js','mjs','cjs','html','htm','svg','zip','bat','cmd','com','scr','ps1','vbs','jar','msi']);
const suspicious = /[<>:"/\\|?*\u0000-\u001f]/;
export const ideaAttachmentAccept = ideaAttachmentMimeTypes.join(',');

export type IdeaPayload = { title:string; problem_or_opportunity:string; proposed_solution:string; expected_benefit:string; category_id:string };

export function validateIdeaPayload(payload: IdeaPayload) {
  const title=payload.title.trim(), problem=payload.problem_or_opportunity.trim(), solution=payload.proposed_solution.trim(), benefit=payload.expected_benefit.trim();
  if (title.length<5 || title.length>150) return 'Title must be 5 to 150 characters.';
  if (problem.length<20 || problem.length>3000) return 'Problem or opportunity must be 20 to 3,000 characters.';
  if (solution.length<20 || solution.length>5000) return 'Proposed solution must be 20 to 5,000 characters.';
  if (benefit.length>3000) return 'Expected benefit must be 3,000 characters or fewer.';
  if (!payload.category_id) return 'Choose a category.';
  return null;
}

export function validateIdeaComment(content:string) {
  const value=content.trim();
  if (!value) return 'Review note cannot be empty.';
  if (value.length>2000) return 'Review note must be 2,000 characters or fewer.';
  return null;
}

export function validateIdeaStatusChange(status:IdeaStatus, reason:string) {
  if (!ideaStatuses.includes(status)) return 'Choose a valid status.';
  if (status==='rejected' && reason.trim().length<5) return 'Add a rejection reason of at least 5 characters.';
  if (reason.trim().length>2000) return 'Decision note must be 2,000 characters or fewer.';
  return null;
}

export function validateIdeaAttachment(file:{name:string;type?:string;size:number}) {
  const parts=file.name.trim().toLowerCase().split('.').filter(Boolean), extension=parts.at(-1)||'';
  if (!file.size) return 'Attachment cannot be empty.';
  if (file.size>ideaAttachmentMaxBytes) return 'Attachment must be 20 MB or smaller.';
  if (!ideaAttachmentMimeTypes.includes(file.type||'')) return 'Upload a PDF, Word, PNG, or JPG file.';
  if (!extensions[file.type||'']?.includes(extension)) return 'Attachment extension must match its file type.';
  if (parts.slice(0,-1).some(value=>dangerous.has(value)) || suspicious.test(file.name) || file.name.includes('..')) return 'Attachment filename is unsafe.';
  return null;
}

export function safeIdeaFilename(name:string) { return name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/\s+/g,' ').slice(0,160)||'attachment'; }
export function ideaStatusLabel(status:string) { return status.split('_').map(word=>word[0]?.toUpperCase()+word.slice(1)).join(' '); }
export function ideaStatusTone(status:string):'default'|'pending'|'success'|'danger'|'info' { return status==='implemented'?'success':status==='rejected'?'danger':status==='under_review'?'info':status==='approved'||status==='in_progress'?'pending':'default'; }
export function allowedNextStatuses(status:IdeaStatus):IdeaStatus[] { return ({submitted:['under_review'],under_review:['approved','rejected'],approved:['in_progress'],in_progress:['implemented'],implemented:[],rejected:[]} as Record<IdeaStatus,IdeaStatus[]>)[status]; }
