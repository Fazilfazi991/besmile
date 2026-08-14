import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';

export async function GET(_request:Request,context:{params:Promise<{id:string;documentId:string}>}){
  const {id,documentId}=await context.params;const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const document=await db.from('documents').select('id,storage_path,file_name,meeting_id').eq('id',documentId).eq('meeting_id',id).maybeSingle();if(document.error||!document.data)return NextResponse.json({error:'Minutes document not found.'},{status:404});
  const audit=await db.rpc('record_meeting_mom_download',{target_meeting:id,target_document:documentId});if(audit.error)return NextResponse.json({error:'Permission denied.'},{status:403});
  const signed=await db.storage.from('employee-documents').createSignedUrl(document.data.storage_path,300);if(signed.error)return NextResponse.json({error:'Unable to open the minutes document.'},{status:400});
  return NextResponse.json({signedUrl:signed.data.signedUrl,fileName:document.data.file_name});
}
