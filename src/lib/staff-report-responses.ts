import { supabase } from '@/lib/supabase';

const db: any = supabase;

export const staffReportResponseMaxLength = 2000;

export function staffReportResponseError(value: string) {
  const length = value.trim().length;
  if (!length) return 'Enter a response before saving.';
  if (length > staffReportResponseMaxLength) return 'Responses must be 2,000 characters or fewer.';
  return '';
}

export type StaffReportSource = 'task_comment' | 'daily_work_update';

export async function attachStaffReportResponses(client: any, reports: any[], source: StaffReportSource = 'task_comment') {
  const reportIds = reports.map(report => report.id);
  if (!reportIds.length) return reports;
  const foreignKey = source === 'task_comment' ? 'task_comment_id' : 'daily_work_update_id';
  const { data: responses, error } = await client
    .from('staff_report_responses')
    .select('id,task_comment_id,daily_work_update_id,responder_id,response_text,created_at,updated_at')
    .in(foreignKey, reportIds)
    .order('created_at');
  if (error) throw error;
  const responderIds = [...new Set((responses || []).map((response: any) => response.responder_id))];
  const { data: responders, error: responderError } = responderIds.length
    ? await client.from('profiles').select('id,full_name').in('id', responderIds)
    : { data: [], error: null };
  if (responderError) throw responderError;
  const responderNames = new Map((responders || []).map((person: any) => [person.id, person]));
  return reports.map(report => ({
    ...report,
    staff_report_responses: (responses || [])
      .filter((response: any) => response[foreignKey] === report.id)
      .map((response: any) => ({ ...response, responder_profile: responderNames.get(response.responder_id) || null })),
  }));
}

export async function addStaffReportResponse(source: StaffReportSource, reportId: string, responderId: string, responseText: string) {
  const validation = staffReportResponseError(responseText);
  if (validation) throw new Error(validation);
  const { data, error } = await db.from('staff_report_responses').insert({
    [source === 'task_comment' ? 'task_comment_id' : 'daily_work_update_id']: reportId,
    responder_id: responderId,
    response_text: responseText.trim(),
  }).select('id').single();
  if (error) throw error;
  return data;
}

export async function updateStaffReportResponse(responseId: string, responseText: string) {
  const validation = staffReportResponseError(responseText);
  if (validation) throw new Error(validation);
  const { data, error } = await db.from('staff_report_responses').update({
    response_text: responseText.trim(),
  }).eq('id', responseId).select('id').single();
  if (error) throw error;
  return data;
}
