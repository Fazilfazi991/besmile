import { supabase } from './supabase';

export type AvailabilityConflict = { type: 'blocked' | 'meeting'; start_at: string; end_at: string };
export type InviteeAvailability = { employee_id: string; available: boolean; conflicts: AvailabilityConflict[] };
export type MeetingParticipantRecord = { employee_id: unknown; profiles?: { full_name?: string | null; designation?: string | null; department?: { name?: string | null } | null } | null };
export type CalendarBlockPayload = { start_at: string; end_at: string; all_day: boolean; title: string | null };
export type MeetingMinutesPayload = { discussion: string; additional: string; decisions: Array<{ text: string }>; actionItems: Array<{ action: string; owner_id: string; due_date: string; status: 'pending' | 'completed' }> };

const db = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase as any; };
const meetingSelect = '*,organizer:profiles!meetings_organizer_id_fkey(id,full_name,designation,role),host:profiles!meetings_host_user_id_fkey(id,full_name,designation,role),meeting_participants(employee_id,profiles(full_name,designation,department:departments(name))),meeting_notes(*),meeting_decisions(*),meeting_action_items(*,owner:profiles!meeting_action_items_responsible_user_id_fkey(id,full_name)),meeting_mom_versions(*,document:documents(id,title,file_name,storage_path,created_at)),meeting_events(*,actor:profiles(full_name))';

export const calendarMeetingRepository = {
  async meetingPermissions() {
    const codes = ['meetings.view', 'meetings.create', 'meetings.host', 'meetings.manage', 'meetings.notes'];
    const results = await Promise.all(codes.map(code => db().rpc('has_permission', { permission_code: code })));
    for (const result of results) if (result.error) throw result.error;
    return Object.fromEntries(codes.map((code, index) => [code, results[index].data === true])) as Record<string, boolean>;
  },
  async meetingEmployees() { const result = await db().from('profiles').select('id,full_name,designation,avatar_url,department:departments(name)').eq('is_employee',true).eq('workforce_visible',true).eq('status','active').order('full_name').limit(250); if (result.error) throw result.error; return result.data || []; },
  async approvedHosts() { const result = await db().rpc('meeting_hosts'); if (result.error) throw result.error; return result.data || []; },
  async myBlocks(userId: string) { const result = await db().from('calendar_blocks').select('*').eq('employee_id', userId).order('start_at'); if (result.error) throw result.error; return result.data || []; },
  async createMyBlock(userId: string, payload: CalendarBlockPayload) { const result = await db().from('calendar_blocks').insert({ ...payload, employee_id: userId }).select().single(); if (result.error) throw result.error; return result.data; },
  async updateMyBlock(userId: string, id: string, payload: CalendarBlockPayload) { const result = await db().from('calendar_blocks').update(payload).eq('id', id).eq('employee_id', userId).select().single(); if (result.error) throw result.error; return result.data; },
  async removeMyBlock(userId: string, id: string) { const result = await db().from('calendar_blocks').delete().eq('id', id).eq('employee_id', userId).select('id').single(); if (result.error) throw result.error; return result.data; },
  async myMeetings(_userId: string) { const result = await db().from('meetings').select(meetingSelect).order('start_at', { ascending: false }); if (result.error) throw result.error; return result.data || []; },
  async meeting(id: string) { const result = await db().from('meetings').select(meetingSelect).eq('id', id).single(); if (result.error) throw result.error; return result.data; },
  async myCalendar(userId: string) { const [blocks, meetings] = await Promise.all([this.myBlocks(userId), this.myMeetings(userId)]); return [...blocks.map((item: any) => ({ ...item, kind: 'blocked' as const })), ...meetings.filter((item: any) => item.status === 'scheduled').map((item: any) => ({ ...item, kind: 'meeting' as const }))].sort((a: any, b: any) => a.start_at.localeCompare(b.start_at)); },
  async availability(start_at: string, end_at: string, employee_ids: string[], ignore?: string) { const result = await db().rpc('meeting_conflicts', { proposed_start: start_at, proposed_end: end_at, participant_ids: employee_ids, ignored_meeting: ignore || null }); if (result.error) throw result.error; const by = new Map<string, AvailabilityConflict[]>(); for (const item of result.data || []) { const list = by.get(item.employee_id) || []; list.push({ type: item.conflict_kind, start_at: item.conflict_start, end_at: item.conflict_end }); by.set(item.employee_id, list); } return employee_ids.map(employee_id => ({ employee_id, available: !(by.get(employee_id)?.length), conflicts: by.get(employee_id) || [] })) as InviteeAvailability[]; },
  async save(payload: any) { const result = await db().rpc('save_meeting', payload); if (result.error) throw result.error; return result.data; },
  async cancel(id: string, reason: string) { const result = await db().rpc('cancel_meeting', { target_meeting: id, cancel_reason: reason }); if (result.error) throw result.error; return result.data; },
  async saveMinutes(id: string, payload: MeetingMinutesPayload) { const result = await db().rpc('save_meeting_minutes', { target_meeting: id, discussion: payload.discussion, additional: payload.additional, decisions: payload.decisions, action_items: payload.actionItems }); if (result.error) throw result.error; return result.data; },
};
