import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';

export async function GET(_request:Request,{params}:{params:Promise<{documentId:string}>}){
  const {documentId}=await params;const db=await serverSupabase();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const document=await db.from('policy_documents').select('storage_bucket,storage_path').eq('id',documentId).single();if(document.error||!document.data)return NextResponse.json({error:'Policy source is unavailable.'},{status:404});
  const signed=await db.storage.from(document.data.storage_bucket).createSignedUrl(document.data.storage_path,120);if(signed.error)return NextResponse.json({error:'Policy source is unavailable.'},{status:503});
  return NextResponse.json({url:signed.data.signedUrl,expiresIn:120},{headers:{'Cache-Control':'private, no-store'}});
}
