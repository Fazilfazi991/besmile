import { NextResponse } from 'next/server';
import { createHash,randomUUID } from 'node:crypto';
import { serverSupabase } from '@/lib/supabase-server';
import { extractPolicyPdf } from '@/lib/policy-pdf';

export const runtime='nodejs';
const bucket='policy-documents';

async function manager(){const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return {db,user:null,allowed:false};const permission=await db.rpc('has_permission',{permission_code:'policy_assistant.manage'});return {db,user,allowed:permission.data===true};}

export async function GET(){
  const {db,user,allowed}=await manager();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});if(!allowed)return NextResponse.json({error:'Permission denied'},{status:403});
  const result=await db.from('policy_documents').select('id,title,version,document_type,applicable_to,effective_date,last_updated_on,status,page_count,created_at,published_at,is_current,policy_document_audiences(audience_type,audience_value),policy_sections(count)').order('created_at',{ascending:false});
  return result.error?NextResponse.json({error:'Unable to load policies.'},{status:503}):NextResponse.json({documents:result.data},{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(request:Request){
  const {db,user,allowed}=await manager();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});if(!allowed)return NextResponse.json({error:'Permission denied'},{status:403});
  let form:FormData;try{form=await request.formData();}catch{return NextResponse.json({error:'Invalid upload.'},{status:400});}
  const file=form.get('file');if(!(file instanceof File))return NextResponse.json({error:'A PDF file is required.'},{status:400});
  if(file.size<1||file.size>26214400||file.type!=='application/pdf'||!file.name.toLowerCase().endsWith('.pdf'))return NextResponse.json({error:'Upload a PDF no larger than 25 MB.'},{status:400});
  const required=['title','version','document_type','applicable_to'];for(const field of required)if(!String(form.get(field)||'').trim())return NextResponse.json({error:`${field} is required.`},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer());let extracted;try{extracted=await extractPolicyPdf(bytes);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to extract PDF.'},{status:422});}
  const storagePath=`policies/${randomUUID()}/${randomUUID()}.pdf`;
  const uploaded=await db.storage.from(bucket).upload(storagePath,bytes,{contentType:'application/pdf',upsert:false});
  if(uploaded.error)return NextResponse.json({error:'Private PDF storage is unavailable.'},{status:503});
  const metadata={title:String(form.get('title')).trim(),version:String(form.get('version')).trim(),document_type:String(form.get('document_type')).trim(),applicable_to:String(form.get('applicable_to')).trim(),effective_date:String(form.get('effective_date')||''),last_updated_on:String(form.get('last_updated_on')||''),storage_path:storagePath,original_file_name:file.name,file_size:file.size,checksum:createHash('sha256').update(bytes).digest('hex'),page_count:extracted.pageCount};
  const audience=[{audience_type:String(form.get('audience_type')||'employees'),audience_value:String(form.get('audience_value')||'')||null}];
  const created=await db.rpc('create_policy_document_draft',{metadata,sections:extracted.sections,audience});
  if(created.error){await db.storage.from(bucket).remove([storagePath]);return NextResponse.json({error:created.error.message||'Unable to save policy draft.'},{status:400});}
  return NextResponse.json({id:created.data,preview:{pageCount:extracted.pageCount,characterCount:extracted.characterCount,sections:extracted.sections.map(section=>({section_number:section.section_number,section_title:section.section_title,page_start:section.page_start,page_end:section.page_end}))}},{status:201});
}
