import 'server-only';
import { buildGroundedInstructions, buildProviderInput, ChatTurn, extractiveGroundedAnswer, POLICY_NOT_FOUND, PolicyAnswer, PolicySource } from './policy-assistant-engine';

type ProviderRequest={question:string;history:ChatTurn[];sources:PolicySource[]};

function responseText(payload:any){
  return (payload?.output||[]).flatMap((item:any)=>item?.content||[]).map((item:any)=>item?.text).filter(Boolean).join('\n').trim();
}

export async function answerPolicyQuestion(request:ProviderRequest):Promise<PolicyAnswer>{
  if((process.env.POLICY_ASSISTANT_PROVIDER||'extractive').toLowerCase()!=='openai')return extractiveGroundedAnswer(request.question,request.history,request.sources);
  if(!process.env.OPENAI_API_KEY)throw new Error('POLICY_PROVIDER_UNAVAILABLE');
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:process.env.OPENAI_POLICY_MODEL||'gpt-5.6-luna',instructions:buildGroundedInstructions(),input:buildProviderInput(request.question,request.history,request.sources),max_output_tokens:500,store:false,text:{verbosity:'low'}}),
    signal:AbortSignal.timeout(20000),cache:'no-store',
  });
  if(!response.ok)throw new Error('POLICY_PROVIDER_UNAVAILABLE');
  const answer=responseText(await response.json());
  if(!answer)throw new Error('POLICY_PROVIDER_UNAVAILABLE');
  if(answer===POLICY_NOT_FOUND)return {answer,sources:[],status:'not_found'};
  return {answer,sources:request.sources.map(({content:_,...source})=>source),status:'answered'};
}
