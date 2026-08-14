import { NextResponse } from 'next/server';
import { generateOfficialDocument } from '@/lib/official-document-engine';
import { offerLetterBody, officialDocumentFilename, validateOfficialDocumentInput } from '@/lib/official-document-types';
import { serverSupabase } from '@/lib/supabase-server';

export const runtime='nodejs';
export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const permission=await db.rpc('has_permission',{permission_code:'onboarding.manage'});if(!permission.data)return NextResponse.json({error:'Permission denied'},{status:403});
 const [record,signatory]=await Promise.all([db.from('employee_onboardings').select('*,department:departments(name)').eq('id',id).maybeSingle(),db.from('profiles').select('full_name,designation').eq('id',user.id).single()]);
 if(record.error||!record.data)return NextResponse.json({error:'Onboarding not found.'},{status:404});
 const item:any=record.data;if(!['documents_verified','offer_generated','offer_sent'].includes(item.stage))return NextResponse.json({error:'Verify all mandatory documents before generating an offer.'},{status:409});
 const issueDate=new Date().toISOString().slice(0,10);const input=validateOfficialDocumentInput({documentType:'offer_letter',issueDate,relatedName:item.full_name,position:item.designation,department:item.department?.name||'',joiningDate:item.expected_joining_date,compensation:item.compensation||'',signatoryName:signatory.data?.full_name||'',signatoryTitle:signatory.data?.designation||'',body:offerLetterBody(item.full_name,item.designation,item.expected_joining_date)});
 const {buffer,pageCount}=await generateOfficialDocument(input);const filename=officialDocumentFilename(input);const storagePath=`company/${user.id}/onboarding/${id}/official/${crypto.randomUUID()}-${filename}`;
 const upload=await db.storage.from('employee-documents').upload(storagePath,buffer,{contentType:'application/pdf',upsert:false});if(upload.error)return NextResponse.json({error:'Unable to store the generated offer.'},{status:400});
 const inserted=await db.from('documents').insert({title:`Offer Letter - ${item.full_name}`,description:'Generated from the employee onboarding record.',category:'Official:Offer Letter',storage_path:storagePath,file_name:filename,mime_type:'application/pdf',file_size:buffer.length,uploaded_by:user.id,source_type:'official_generated',document_type:'offer_letter',generated_at:new Date().toISOString(),page_count:pageCount,official_status:'available',onboarding_id:id}).select('id').single();
 if(inserted.error){await db.storage.from('employee-documents').remove([storagePath]);return NextResponse.json({error:'Unable to save offer-letter history.'},{status:400})}
 const linked=await db.rpc('record_onboarding_offer',{target_onboarding:id,target_document:inserted.data.id});if(linked.error)return NextResponse.json({error:linked.error.message},{status:409});
 return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','X-Document-Id':inserted.data.id}});
}
