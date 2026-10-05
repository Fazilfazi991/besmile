import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
process.loadEnvFile('../.env.release-gate.local');
const url=process.env.BSMILE_QA_SUPABASE_URL!;
if(new URL(url).hostname!=='enylrvmjgbntkrgpqsfe.supabase.co')throw Error('Approved QA only');
const dir='release-evidence/online-psychologists/phase2';
const f=JSON.parse(readFileSync(`${dir}/qa-fixtures.local.json`,'utf8'));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const results=[];
for(const actor of ['faiz','diya','psychologist']){
 const db=createClient(url,process.env.BSMILE_QA_SUPABASE_ANON_KEY!,options);
 const identity=f.users[actor];
 const signed=await db.auth.signInWithPassword({email:identity.email,password:f.password});
 if(signed.error)throw signed.error;
 const edit=await db.rpc('replace_clinician_availability',{target_doctor:f.doctors.a,ranges:[{day_of_week:1,start_time:'09:00',end_time:'17:00'}]});
 if(edit.error)throw edit.error;
 const profile=await db.rpc('save_clinician_profile',{target_doctor:f.doctors.a,patch:{professional_information:`QA scoped ${actor} qualification`}});
 if(profile.error)throw profile.error;
 results.push({actor,availability:'PASS',profile:'PASS'});
 await db.auth.signOut();
}
const svc=createClient(url,process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!,options);
const auth=await svc.auth.admin.getUserById(f.external.a.id);
assert.ok(auth.data.user?.email_confirmed_at);
writeFileSync(`${dir}/manager-scopes.json`,JSON.stringify(results,null,2));
console.log('Three explicitly scoped QA manager equivalents: PASS.');
