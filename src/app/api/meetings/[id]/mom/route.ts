import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { generateMeetingMinutesDocument } from '@/lib/official-document-engine';
import { hasMeaningfulMinutes, meetingMinutesFilename, meetingMinutesPdfInput } from '@/lib/meeting-mom';

export const runtime='nodejs';
const selection='*,host:profiles!meetings_host_user_id_fkey(id,full_name,designation),meeting_participants(employee_id,profiles(full_name)),meeting_notes(*),meeting_decisions(*),meeting_action_items(*,owner:profiles!meeting_action_items_responsible_user_id_fkey(full_name)),meeting_mom_versions(version_number)';

export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const [record,notesPermission]=await Promise.all([db.from('meetings').select(selection).eq('id',id).maybeSingle(),db.rpc('has_permission',{permission_code:'meetings.notes'})]);
  if(record.error||!record.data)return NextResponse.json({error:'Meeting not found.'},{status:404});
  const meeting:any=record.data;if(meeting.status==='cancelled'||new Date(meeting.end_at)>new Date())return NextResponse.json({error:'Minutes can be generated only after the meeting ends.'},{status:409});
  const canGenerate=meeting.host_user_id===user.id&&notesPermission.data===true||await db.rpc('has_permission',{permission_code:'meetings.manage'}).then(result=>result.data===true);
  if(!canGenerate)return NextResponse.json({error:'Only the host or authorized meeting management can generate minutes.'},{status:403});
  const input=meetingMinutesPdfInput(meeting);if(!hasMeaningfulMinutes(input))return NextResponse.json({error:'Save discussion notes, a decision, or an action item before generating minutes.'},{status:409});
  const version=Math.max(0,...(meeting.meeting_mom_versions||[]).map((item:any)=>Number(item.version_number)||0))+1;const date=new Date(meeting.start_at).toISOString().slice(0,10);const filename=meetingMinutesFilename(meeting.title,date,version);
  const {buffer,pageCount}=await generateMeetingMinutesDocument(input);const storagePath=`company/${user.id}/meetings/${id}/${crypto.randomUUID()}-${filename}`;
  const upload=await db.storage.from('employee-documents').upload(storagePath,buffer,{contentType:'application/pdf',upsert:false});if(upload.error)return NextResponse.json({error:'Unable to store the minutes PDF.'},{status:400});
  const document=await db.from('documents').insert({title:`Minutes of Meeting - ${meeting.title} v${version}`,description:'Generated from persisted meeting notes and action items.',category:'Official:Minutes of Meeting',storage_path:storagePath,file_name:filename,mime_type:'application/pdf',file_size:buffer.length,uploaded_by:user.id,source_type:'official_generated',document_type:'minutes_of_meeting',generated_at:new Date().toISOString(),page_count:pageCount,official_status:'available',meeting_id:id}).select('id').single();
  if(document.error){await db.storage.from('employee-documents').remove([storagePath]);return NextResponse.json({error:'Unable to save the minutes history.'},{status:400})}
  const history=await db.rpc('record_meeting_mom',{target_meeting:id,target_document:document.data.id});
  if(history.error){const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});await admin.from('documents').delete().eq('id',document.data.id);await admin.storage.from('employee-documents').remove([storagePath]);return NextResponse.json({error:history.error.message},{status:409})}
  return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','X-Document-Filename':encodeURIComponent(filename),'X-Document-Id':document.data.id,'X-MoM-Version':String(version)}});
}
