import { storedToBusinessParts } from './calendar-meeting-rules';
import type { MeetingParticipantRecord } from './calendar-meeting-repository';
import type { MeetingFields } from './meeting-form-rules';

export type EditableMeetingRecord = { id: string; organizer_id: string; host_user_id?: string | null; title: string | null; agenda: string | null; start_at: string; end_at: string; meeting_type: string | null; venue: string | null; meeting_url: string | null; description: string | null; meeting_participants?: readonly MeetingParticipantRecord[] | null };
export type MeetingFormMode = 'create' | 'edit';

export function participantIdsFromMeeting(participants: readonly MeetingParticipantRecord[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const participant of participants ?? []) if (typeof participant.employee_id === 'string' && participant.employee_id.trim()) ids.add(participant.employee_id);
  return [...ids];
}

export function meetingFieldsFromRecord(meeting: EditableMeetingRecord): MeetingFields {
  const start = storedToBusinessParts(meeting.start_at); const end = storedToBusinessParts(meeting.end_at);
  return { title: meeting.title ?? '', agenda: meeting.agenda ?? '', date: start.date, start: start.time, end: end.time, type: meeting.meeting_type ?? 'office', venue: meeting.venue ?? '', url: meeting.meeting_url ?? '', notes: meeting.description ?? '', hostId: meeting.host_user_id ?? '', invitees: participantIdsFromMeeting(meeting.meeting_participants) };
}

export function canEditMeeting(permissions: Record<string, boolean>, meeting: Pick<EditableMeetingRecord, 'organizer_id'>, currentProfileId: string | undefined) {
  return permissions['meetings.manage'] === true || meeting.organizer_id === currentProfileId;
}

export function availabilityIgnoreMeetingId(mode: MeetingFormMode, meetingId: string | undefined) {
  return mode === 'edit' ? meetingId : undefined;
}
