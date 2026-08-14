import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {describe,expect,it} from 'vitest';
const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260814071316_meetings_and_minutes.sql'),'utf8');const reminder=sql.slice(sql.indexOf('create or replace function public.process_meeting_notes_reminders()'));
describe('post-meeting reminder processor',()=>{
  it('runs only after end time for non-cancelled scheduled meetings',()=>{expect(reminder).toContain("meeting.status='scheduled' and meeting.end_at<=now()");expect(reminder).not.toContain("meeting.start_at<=now()")});
  it('sends exactly to the host and deep-links to notes',()=>{expect(reminder).toContain("perform public.notify_user(item.host_user_id,'Meeting completed - notes required'");expect(reminder).toContain("'#notes'")});
  it('is idempotent and safe under concurrent workers',()=>{expect(reminder).toContain('meeting.notes_reminder_sent_at is null');expect(reminder).toContain('for update skip locked');expect(reminder).toContain('where id=item.id and notes_reminder_sent_at is null');expect(reminder.indexOf('notes_reminder_sent_at=now()')).toBeLessThan(reminder.indexOf('perform public.notify_user'))});
  it('uses one named Supabase Cron schedule every five minutes',()=>{expect(sql).toContain("cron.schedule('meeting-notes-reminders','*/5 * * * *'");expect(sql).toContain("cron.unschedule(existing_job)")});
  it('cannot be called by browser roles',()=>{expect(sql).toContain('public.process_meeting_notes_reminders() from public,anon,authenticated');expect(sql).toContain('public.process_meeting_notes_reminders() to service_role')});
});
