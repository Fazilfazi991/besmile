import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientSafeError, normalizeClientError } from './client-error';
const { from, rpc, selections } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), selections: [] as string[] }));
vi.mock('./supabase', () => ({ supabase: { from, rpc } }));
import { calendarMeetingRepository as repository } from './calendar-meeting-repository';

describe('meeting participant profile relationship', () => {
  beforeEach(() => {
    selections.length = 0;
    from.mockImplementation((table: string) => {
      let selection = '';
      const query: any = {
        select: (value: string) => { selection = value; selections.push(value); return query; },
        eq: vi.fn(() => query), or: vi.fn(() => query), order: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          if (table === 'meeting_participants') return Promise.resolve({ data: [{ meeting_id: 'meeting' }] }).then(resolve);
          if (table === 'calendar_blocks') return Promise.resolve({ data: [] }).then(resolve);
          // Model both employee_id and invited_by relationships in the database.
          if (!selection.includes('profiles!meeting_participants_employee_id_fkey(')) {
            return Promise.resolve({ error: { code: 'PGRST201', message: 'Could not embed because more than one relationship was found' } }).then(resolve);
          }
          return Promise.resolve({ data: [{ id: 'meeting', status: 'scheduled', start_at: '2026-09-10T09:00:00Z', meeting_participants: [{ employee_id: 'participant', profiles: { full_name: 'Participant, not inviter' } }] }] }).then(resolve);
        },
      };
      return query;
    });
  });
  it('loads meetings using the participant relationship when invited_by also exists', async () => {
    const meetings = await repository.myMeetings('participant');
    expect(meetings[0].meeting_participants[0]).toEqual({ employee_id: 'participant', profiles: { full_name: 'Participant, not inviter' } });
    expect(selections.join(' ')).not.toContain('profiles!meeting_participants_invited_by_fkey');
  });
  it('does not leak private reasons through availability', async () => {
    rpc.mockResolvedValueOnce({ data: [{ employee_id: 'participant', conflict_kind: 'blocked', conflict_start: 'start', conflict_end: 'end', reason: 'private', conflict_title: 'private', notes: 'private' }] });
    expect(await repository.availability('start', 'end', ['participant'])).toEqual([{ employee_id: 'participant', available: false, conflicts: [{ type: 'blocked', start_at: 'start', end_at: 'end' }] }]);
  });
  it('loads the same meeting into My Calendar', async () => {
    expect(await repository.myCalendar('participant')).toEqual([expect.objectContaining({ id: 'meeting', kind: 'meeting', meeting_participants: [expect.objectContaining({ employee_id: 'participant' })] })]);
  });
  it.each([
    "Could not embed because more than one relationship was found for 'meeting_participants' and 'profiles'",
    'PGRST201: ambiguous embed',
  ])('normalizes raw relationship failures: %s', message => {
    expect(normalizeClientError(new Error(message), 'Unable to load meetings.')).toBe('Unable to load meetings.');
  });
  it('logs sanitized database context without participant information', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(clientSafeError({ code: 'PGRST201', message: 'Could not embed private participant info' }, 'Unable to load meetings.', { route: 'meetings', action: 'load' })).toBe('Unable to load meetings.');
      expect(spy).toHaveBeenCalledWith('[client-runtime-error]', expect.objectContaining({ code: 'PGRST201', category: 'database' }));
      expect(JSON.stringify(spy.mock.calls)).not.toContain('private participant');
    } finally { spy.mockRestore(); }
  });
});
