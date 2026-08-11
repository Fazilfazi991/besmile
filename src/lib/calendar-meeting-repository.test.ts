import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/lib/calendar-meeting-repository.ts'), 'utf8');
describe('calendar meeting repository security contract', () => {
  it('scopes blocks and visible meetings to the current employee', () => { expect(source).toContain(".eq('employee_id',userId)"); expect(source).toContain('organizer_id.eq.${userId}'); expect(source).toContain('meeting_participants.employee_id.eq.${userId}'); });
  it('creates, edits, and removes only the logged-in employee’s blocks', () => { expect(source).toContain('createMyBlock(userId:string'); expect(source).toContain('employee_id:userId'); expect(source).toContain('updateMyBlock(userId:string,id:string'); expect(source).toContain(".eq('id',id).eq('employee_id',userId)"); expect(source).toContain('removeMyBlock(userId:string,id:string'); });
  it('combines blocks and scheduled meetings without creating database duplicates', () => { expect(source).toContain("kind:'blocked'"); expect(source).toContain("kind:'meeting'"); expect(source).toContain("x.status==='scheduled'"); });
  it('uses only trusted RPC write paths for meetings', () => { expect(source).toContain(".rpc('save_meeting'"); expect(source).toContain(".rpc('cancel_meeting'"); expect(source).not.toMatch(/from\('meetings'\)\.(insert|update|delete)/); });
  it('returns only privacy-safe availability fields', () => { expect(source).toContain("type:x.conflict_kind,start_at:x.conflict_start,end_at:x.conflict_end"); expect(source).not.toContain('conflict_title'); expect(source).not.toContain('reason'); expect(source).not.toContain('notes'); });
  it('keeps management authorization server-side', () => { expect(source).toContain(".rpc('save_meeting'"); expect(source).toContain(".rpc('cancel_meeting'"); });
});
