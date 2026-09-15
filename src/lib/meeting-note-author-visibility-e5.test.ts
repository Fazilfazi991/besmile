import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc } }));
import { calendarMeetingRepository } from './calendar-meeting-repository';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260915062539_meeting_note_author_visibility_e5.sql'), 'utf8');

describe('shared meeting-note author visibility', () => {
  beforeEach(() => rpc.mockReset());

  it('reads display names through the meeting-scoped RPC rather than a profiles embed', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'note', content: 'Shared note', author: { full_name: 'Participant A' } }] });
    expect(await calendarMeetingRepository.meetingNotes('meeting')).toEqual([
      { id: 'note', content: 'Shared note', author: { full_name: 'Participant A' } },
    ]);
    expect(rpc).toHaveBeenCalledWith('meeting_note_entries_for_visible_meeting', { target_meeting: 'meeting' });
  });

  it('does not silently hide a database failure', async () => {
    const error = new Error('Meeting note read failed');
    rpc.mockResolvedValue({ error });
    await expect(calendarMeetingRepository.meetingNotes('meeting')).rejects.toBe(error);
  });

  it('discloses only note author display names after canonical meeting authorization', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('(select auth.uid()) is not null');
    expect(migration).toContain('public.meeting_visible(target_meeting)');
    expect(migration).toContain('note.meeting_id = target_meeting');
    expect(migration).toContain("jsonb_build_object('full_name'");
    expect(migration).toContain('revoke all on function public.meeting_note_entries_for_visible_meeting(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.meeting_note_entries_for_visible_meeting(uuid) to authenticated');
    expect(migration).not.toMatch(/grant\s+(?:all|select)\s+on\s+(?:public\.)?profiles/i);
  });
});
