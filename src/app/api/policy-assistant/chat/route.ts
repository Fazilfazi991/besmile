import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { ChatTurn, detectDocumentTypes, POLICY_NOT_FOUND, POLICY_UNAVAILABLE, queryTerms, RETRIEVAL_UNAVAILABLE } from '@/lib/policy-assistant-engine';
import { answerPolicyQuestion } from '@/lib/policy-assistant-provider';

export const runtime='nodejs';

export async function POST(request:Request){
  const db=await serverSupabase();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const permission=await db.rpc('has_permission',{permission_code:'policy_assistant.use'});
  if(permission.error||!permission.data)return NextResponse.json({error:'Permission denied'},{status:403});
  const limited=await db.rpc('check_policy_assistant_rate_limit');
  if(limited.error)return NextResponse.json({answer:RETRIEVAL_UNAVAILABLE,sources:[],status:'unavailable'},{status:503});
  if(!limited.data)return NextResponse.json({error:'Please wait a few minutes before asking another policy question.'},{status:429});
  let body:any; try{body=await request.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
  const question=typeof body?.question==='string'?body.question.trim():'';
  if(question.length<2||question.length>1000)return NextResponse.json({error:'Question must be between 2 and 1,000 characters.'},{status:400});
  const history:ChatTurn[]=Array.isArray(body.history)?body.history.slice(-6).filter((turn:any)=>['user','assistant'].includes(turn?.role)&&typeof turn?.content==='string').map((turn:any)=>({role:turn.role,content:turn.content.slice(0,1500)})):[];
  const terms=queryTerms(question,history);
  if(!terms.length)return NextResponse.json({answer:POLICY_NOT_FOUND,sources:[],status:'not_found'});
  const {data,error}=await db.rpc('search_policy_sections',{search_query:terms.join(' '),limit_count:6,document_types:detectDocumentTypes(question,history)});
  if(error)return NextResponse.json({answer:RETRIEVAL_UNAVAILABLE,sources:[],status:'unavailable'},{status:503});
  if(!data?.length)return NextResponse.json({answer:POLICY_NOT_FOUND,sources:[],status:'not_found'});
  try{return NextResponse.json(await answerPolicyQuestion({question,history,sources:data}),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({answer:POLICY_UNAVAILABLE,sources:[],status:'unavailable'},{status:503});}
}
