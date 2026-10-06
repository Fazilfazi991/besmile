import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
process.loadEnvFile('../.env.release-gate.local');
const url=process.env.BSMILE_QA_SUPABASE_URL!;
if(new URL(url).hostname!=='enylrvmjgbntkrgpqsfe.supabase.co'||process.env.BSMILE_QA_PROJECT_REF!=='enylrvmjgbntkrgpqsfe')throw Error('Isolated QA required.');
const db=createClient(url,process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const path='release-evidence/online-psychologists/phase2/qa-fixtures.local.json';const f=JSON.parse(readFileSync(path,'utf8'));
for(const size of ['desktop','mobile']) {
 if(!f[`browserAppointment_${size}`]) {const start=new Date(Date.now()+6*86400000);start.setUTCHours(size==='desktop'?9:11,0,0,0);const {data,error}=await db.from('doctor_appointments').insert({patient_id:f.patients.a.id,doctor_id:f.doctors.a,start_at:start.toISOString(),end_at:new Date(+start+1800000).toISOString(),consultation_type:'online',status:'scheduled',remarks:`QA ${size} response fixture`,created_by:f.users.faiz.id}).select('id').single();if(error)throw Error(error.message);f[`browserAppointment_${size}`]=data.id;writeFileSync(path,JSON.stringify(f,null,2));}
}
console.log('Prepared two disposable scheduled appointments for browser responses.');
