import { businessTimezone, storedToBusinessParts } from './calendar-meeting-rules';
import type { MeetingMinutesPdfInput } from './official-document-engine';

export function effectiveMeetingStatus(meeting:{status:string;start_at:string;end_at:string},now=new Date()){
  if(meeting.status==='cancelled')return 'cancelled';
  if(now<new Date(meeting.start_at))return 'scheduled';
  if(now<new Date(meeting.end_at))return 'in_progress';
  return 'completed';
}

export function meetingMinutesPdfInput(meeting:any,generatedAt=new Date()):MeetingMinutesPdfInput{
  const note=Array.isArray(meeting.meeting_notes)?meeting.meeting_notes[0]:meeting.meeting_notes;
  const participants=(meeting.meeting_participants||[]).map((item:any)=>item.profiles?.full_name).filter(Boolean);
  const date=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:businessTimezone}).format(new Date(meeting.start_at));
  const generatedDate=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:businessTimezone}).format(generatedAt);
  return {meetingTitle:meeting.title,meetingDate:date,meetingTime:`${storedToBusinessParts(meeting.start_at).time} - ${storedToBusinessParts(meeting.end_at).time} (${businessTimezone})`,hostName:meeting.host?.full_name||'Host',participantNames:participants,agenda:meeting.agenda||'',discussionSummary:note?.discussion_summary||'',decisions:(meeting.meeting_decisions||[]).sort((a:any,b:any)=>a.position-b.position).map((item:any)=>item.decision_text),actionItems:(meeting.meeting_action_items||[]).sort((a:any,b:any)=>a.position-b.position).map((item:any)=>({action:item.action_text,owner:item.owner?.full_name||'Unassigned',dueDate:item.due_date||'-',status:item.status||'pending'})),additionalNotes:note?.additional_notes||'',generatedDate,preparedBy:meeting.host?.full_name||'Host'};
}

export function hasMeaningfulMinutes(input:MeetingMinutesPdfInput){return Boolean(input.discussionSummary.trim()||input.decisions.length||input.actionItems.length)}

export function meetingMinutesFilename(title:string,date:string,version:number){const safe=title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60)||'Meeting';return `BSmile_Minutes_of_Meeting_${safe}_${date}_v${version}.pdf`}
