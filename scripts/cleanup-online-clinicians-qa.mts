import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
process.loadEnvFile('../.env.release-gate.local');
const url=process.env.BSMILE_QA_SUPABASE_URL!;
if(new URL(url).hostname!=='enylrvmjgbntkrgpqsfe.supabase.co'||process.env.BSMILE_QA_PROJECT_REF!=='enylrvmjgbntkrgpqsfe')throw Error('Approved disposable QA project required.');
const dir='release-evidence/online-psychologists/phase2';
const f=JSON.parse(readFileSync(`${dir}/qa-fixtures.local.json`,'utf8'));
const db=createClient(url,process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
const internal=Object.values(f.users) as any[],external=Object.entries(f.external) as [string,any][];
// Verify every identity and row before the first mutation; fixture files alone
// do not authorize modifying a pre-existing QA user or clinician.
for(const user of [...internal,f.orphan]){
 const auth=checked(await db.auth.admin.getUserById(user.id)).user;
 assert.equal(auth.email,user.email);assert.equal(auth.app_metadata.qa_run,f.run);
}
for(const [key,user] of external){
 const auth=checked(await db.auth.admin.getUserById(user.id)).user;
 assert.equal(auth.email,user.email);
 assert.equal(auth.app_metadata.clinician_provision_request_id,user.requestId);
 assert.equal(auth.app_metadata.existing_clinician_id,f.doctors[key]);
}
const doctors=checked(await db.from('outsourced_doctors').select('id,doctor_name').in('id',Object.values(f.doctors)));
assert.equal(doctors.length,Object.keys(f.doctors).length);
assert.ok(doctors.every((row:any)=>row.doctor_name.startsWith(`QA P2 ${f.run}`)));
const patients=checked(await db.from('patients').select('id,full_name').in('id',Object.values(f.patients).map((r:any)=>r.id)));
assert.ok(patients.every((row:any)=>row.full_name.startsWith(`QA P2 ${f.run}`)));
const ids=[...internal.map(r=>r.id),...external.map(([,r])=>r.id),f.orphan.id];
const timestamp=new Date().toISOString();
checked(await db.from('user_permission_grants').update({revoked_at:timestamp}).in('profile_id',ids).is('revoked_at',null));
checked(await db.from('profiles').update({login_enabled:false}).in('id',ids));
for(const id of ids)checked(await db.auth.admin.updateUserById(id,{ban_duration:'876000h'}));
// The existing registry requires its privileged lifecycle RPC to archive rows.
// Disable self-service and preserve their IDs/history instead of bypassing it.
checked(await db.from('outsourced_doctors').update({self_service_enabled:false,updated_by:f.users.faiz.id}).in('id',doctors.map((r:any)=>r.id)));
checked(await db.from('doctor_appointments').update({deleted_at:timestamp}).in('patient_id',patients.map((r:any)=>r.id)));
checked(await db.from('patients').update({deleted_at:timestamp}).in('id',patients.map((r:any)=>r.id)));
const profiles=checked(await db.from('profiles').select('id,login_enabled').in('id',ids));
assert.ok(profiles.every((row:any)=>!row.login_enabled));
const remaining=checked(await db.from('user_permission_grants').select('id').in('profile_id',ids).is('revoked_at',null));
assert.equal(remaining.length,0);
writeFileSync(`${dir}/cleanup-result.json`,JSON.stringify({qaProject:'enylrvmjgbntkrgpqsfe',run:f.run,disabledTaskAuthUsers:ids.length,revokedAllFixtureGrants:true,disabledTaskClinicianSelfService:doctors.length,softDeletedTaskPatients:patients.length,auditHistoryPreserved:true,permanentDeletes:0,productionTouched:false,completedAt:timestamp},null,2));
console.log('Disposable QA accounts and clinician self-service disabled, grants revoked, clients soft-deleted; audit history retained.');
