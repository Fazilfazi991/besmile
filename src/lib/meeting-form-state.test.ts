import { describe, expect, it } from 'vitest';
import { availabilityIgnoreMeetingId, canEditMeeting, meetingFieldsFromRecord, participantIdsFromMeeting } from './meeting-form-state';
const meeting = { id: 'meeting-1', organizer_id: 'organizer-1', title: 'Weekly planning', agenda: 'Review priorities', start_at: '2026-08-11T09:30:00.000Z', end_at: '2026-08-11T10:30:00.000Z', meeting_type: 'google_meet', venue: 'Room 4', meeting_url: 'https://meet.google.com/example', description: 'Bring the roadmap', meeting_participants: [{ employee_id: 'employee-1', profiles: { full_name: 'Asha' } }, { employee_id: 'employee-1' }, { employee_id: 'employee-2' }, { employee_id: '' }, { employee_id: null }] };
describe('meeting edit form state', () => {
  it('allows a meeting manager to see Edit Meeting', () => expect(canEditMeeting({ 'meetings.manage': true }, meeting, 'staff-1')).toBe(true));
  it('does not allow a view-only staff user to see Edit Meeting', () => expect(canEditMeeting({ 'meetings.view': true }, meeting, 'staff-1')).toBe(false));
  it('allows the organizer to edit their meeting using the existing management rule', () => expect(canEditMeeting({ 'meetings.view': true }, meeting, 'organizer-1')).toBe(true));
  it('prepopulates all editable meeting metadata in BSmile time', () => expect(meetingFieldsFromRecord(meeting)).toMatchObject({ title: 'Weekly planning', agenda: 'Review priorities', date: '2026-08-11', start: '15:00', end: '16:00', type: 'google_meet', venue: 'Room 4', url: 'https://meet.google.com/example', notes: 'Bring the roadmap' }));
  it('returns verified, unique participant IDs as strings', () => { const ids = participantIdsFromMeeting(meeting.meeting_participants); expect(ids).toEqual(['employee-1', 'employee-2']); expect(ids.every(id => typeof id === 'string')).toBe(true); });
  it('excludes only the current meeting during edit availability checks', () => { expect(availabilityIgnoreMeetingId('edit', 'meeting-1')).toBe('meeting-1'); expect(availabilityIgnoreMeetingId('create', 'meeting-1')).toBeUndefined(); });
});
