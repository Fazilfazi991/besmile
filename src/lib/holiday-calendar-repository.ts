import { supabase } from '@/lib/supabase';

export type HolidayCalendarEvent = {
  id: string; title: string; event_type: 'holiday' | 'awareness' | 'observance';
  start_date: string | null; end_date: string | null; date_precision: 'day' | 'month' | 'period_label';
  is_non_working_day: boolean; description: string | null; year: number; source: string | null;
  source_key: string; created_at: string; updated_at: string;
};
export type HolidayCalendarDraft = Pick<HolidayCalendarEvent, 'title' | 'event_type' | 'start_date' | 'end_date' | 'date_precision' | 'is_non_working_day' | 'description' | 'year'>;

function db() { if (!supabase) throw new Error('Supabase is not configured.'); return supabase; }

export const holidayCalendarRepository = {
  async list() {
    const result = await db().from('holiday_calendar_events').select('*').order('start_date', { ascending: true, nullsFirst: false }).order('title');
    if (result.error) throw result.error;
    return (result.data || []) as HolidayCalendarEvent[];
  },
  async weeklyOffDays() {
    const result = await db().from('company_attendance_settings').select('working_days').eq('id', true).maybeSingle();
    if (result.error) throw result.error;
    const working = new Set<number>(result.data?.working_days || [1, 2, 3, 4, 5, 6]);
    return new Set([0, 1, 2, 3, 4, 5, 6].filter((day) => !working.has(day === 0 ? 7 : day)));
  },
  async create(draft: HolidayCalendarDraft) {
    const sourceKey = `manual-${crypto.randomUUID()}`;
    const result = await db().from('holiday_calendar_events').insert({ ...draft, description: draft.description || null, source: 'BSmile Holiday Calendar', source_key: sourceKey }).select().single();
    if (result.error) throw result.error;
    return result.data as HolidayCalendarEvent;
  },
  async update(id: string, draft: HolidayCalendarDraft) {
    const result = await db().from('holiday_calendar_events').update({ ...draft, description: draft.description || null }).eq('id', id).select().single();
    if (result.error) throw result.error;
    return result.data as HolidayCalendarEvent;
  },
  async remove(id: string) {
    const result = await db().from('holiday_calendar_events').delete().eq('id', id);
    if (result.error) throw result.error;
  },
  async canManage() {
    const result = await db().rpc('has_permission', { permission_code: 'holiday_calendar.manage' });
    if (result.error) throw result.error;
    return result.data === true;
  },
};
