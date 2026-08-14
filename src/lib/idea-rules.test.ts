import { describe, expect, it } from 'vitest';
import { allowedNextStatuses, ideaStatuses, validateIdeaAttachment, validateIdeaPayload, validateIdeaStatusChange } from './idea-rules';

const payload={title:'Monthly knowledge sharing',problem_or_opportunity:'Team knowledge is trapped in one department and repeated questions slow staff.',proposed_solution:'Create a monthly internal session where employees share workflows and tool tips.',expected_benefit:'Employees learn faster.',category_id:'category-id'};

describe('Batch 13 Innovation Hub rules',()=>{
  it('uses the controlled lifecycle',()=>{
    expect(ideaStatuses).toEqual(['submitted','under_review','approved','in_progress','implemented','rejected']);
    expect(allowedNextStatuses('submitted')).toEqual(['under_review']);
    expect(allowedNextStatuses('under_review')).toEqual(['approved','rejected']);
    expect(allowedNextStatuses('approved')).toEqual(['in_progress']);
    expect(allowedNextStatuses('in_progress')).toEqual(['implemented']);
    expect(allowedNextStatuses('implemented')).toEqual([]);
  });
  it('keeps expected benefit optional',()=>{
    expect(validateIdeaPayload(payload)).toBeNull();
    expect(validateIdeaPayload({...payload,expected_benefit:''})).toBeNull();
    expect(validateIdeaPayload({...payload,title:'Idea'})).toBe('Title must be 5 to 150 characters.');
  });
  it('requires rejection reason',()=>{
    expect(validateIdeaStatusChange('under_review','')).toBeNull();
    expect(validateIdeaStatusChange('rejected','')).toBe('Add a rejection reason of at least 5 characters.');
    expect(validateIdeaStatusChange('rejected','Not aligned with current operations.')).toBeNull();
  });
  it('validates private attachment types and filenames',()=>{
    expect(validateIdeaAttachment({name:'workflow.pdf',type:'application/pdf',size:1024})).toBeNull();
    expect(validateIdeaAttachment({name:'workflow.exe',type:'application/x-msdownload',size:1024})).toBe('Upload a PDF, Word, PNG, or JPG file.');
    expect(validateIdeaAttachment({name:'workflow.exe.pdf',type:'application/pdf',size:1024})).toBe('Attachment filename is unsafe.');
  });
});
