import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';

export async function POST(request:Request,{params}:{params:Promise<{documentId:string}>}){
  const {documentId}=await params;const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const permission=await db.rpc('has_permission',{permission_code:'policy_assistant.manage'});if(!permission.data)return NextResponse.json({error:'Permission denied'},{status:403});
  let body:any;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
  const fn=body.action==='publish'?'publish_policy_document':body.action==='archive'?'archive_policy_document':null;if(!fn)return NextResponse.json({error:'Unknown policy action.'},{status:400});
  const result=await db.rpc(fn,{target:documentId});return result.error?NextResponse.json({error:result.error.message},{status:400}):NextResponse.json({document:result.data});
}
