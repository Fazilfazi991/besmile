import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
process.loadEnvFile('../.env.release-gate.local');
const url = process.env.BSMILE_QA_SUPABASE_URL!;
assert.equal(new URL(url).hostname, 'enylrvmjgbntkrgpqsfe.supabase.co');
assert.equal(process.env.BSMILE_QA_PROJECT_REF, 'enylrvmjgbntkrgpqsfe');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!, options);
const dir = 'release-evidence/overnight-photo'; mkdirSync(dir, { recursive: true });
const file = `${dir}/fixtures.local.json`;
const prior = JSON.parse(readFileSync('release-evidence/online-psychologists/phase2/qa-fixtures.local.json','utf8'));
const checked = (r: any) => { if (r.error) throw Error(r.error.message); return r.data; };
const f: any = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : { run: randomUUID(), grants: [], photos: [], doctor: prior.doctors.a, unlinked: prior.doctors.placeholder };
const persist = () => writeFileSync(file, JSON.stringify(f,null,2));
async function login(role: string) {
  const db = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, options);
  checked(await db.auth.signInWithPassword({ email: process.env[`BSMILE_QA_${role}_EMAIL`]!, password: process.env[`BSMILE_QA_${role}_PASSWORD`]! }));
  return db;
}
async function setup() {
  const rows = checked(await service.from('outsourced_doctors').select('*').in('id',[f.doctor,f.unlinked]));
  assert.equal(rows.length,2); assert.ok(rows.every((r:any)=>r.doctor_name.startsWith(`QA P2 ${prior.run}`)), 'Disposable QA registry markers required');
  const doctor = rows.find((r:any)=>r.id===f.doctor); assert.equal(doctor.profile_id,prior.external.a.id);
  if (!f.before) {
    f.before = { doctors: rows, profile: checked(await service.from('profiles').select('id,full_name,phone,personal_email,avatar_url').eq('id',doctor.profile_id).single()),
      availability: checked(await service.from('doctor_weekly_availability').select('*').in('doctor_id',[f.doctor,f.unlinked])) };
    persist();
  }
  const permissions = checked(await service.from('permissions').select('id,code').in('code',['outsourced_clinicians.manage'])); assert.equal(permissions.length,1);
  const admin = await login('ADMIN'); const adminId = checked(await admin.auth.getUser()).user.id;
  for (const role of ['GENERAL_MANAGER','ASSISTANT_MANAGER','PSYCHOLOGIST']) {
    const db = await login(role); const id = checked(await db.auth.getUser()).user.id;
    const profile = checked(await service.from('profiles').select('email,is_employee,login_enabled').eq('id',id).single());
    assert.ok(profile.is_employee && profile.login_enabled && /qa\.|example\.test/.test(profile.email), 'Existing QA manager only');
    if (!checked(await db.rpc('has_permission',{permission_code:'outsourced_clinicians.manage'}))) {
      const grant = checked(await service.from('user_permission_grants').insert({profile_id:id,permission_id:permissions[0].id,granted_by:adminId,
        reason:`Disposable overnight-photo QA ${f.run}`,expires_at:new Date(Date.now()+86400000).toISOString()}).select('id').single());
      f.grants.push(grant.id); persist();
    }
    await db.auth.signOut();
  }
  await admin.auth.signOut();
  console.log('Scoped three existing QA managers; no Auth, patient or appointment mutation.');
}
const results: any[] = [];
async function probe(name: string, run: () => Promise<void>) { try { await run(); results.push({name,status:'PASS'}); } catch(e:any) {results.push({name,status:'FAIL',error:e.message});} }
const range = (day:number,start='13:30',end='01:00')=>({day_of_week:day,start_time:start,end_time:end});
async function run() {
  const manager = await login('GENERAL_MANAGER');
  const replace = (ranges:any[])=>manager.rpc('replace_clinician_availability',{target_doctor:f.doctor,ranges});
  for (const [name,value] of [['same-day',range(1,'09:00','17:00')],['13:30 overnight',range(1)],['13:00 overnight',range(6,'13:00','03:00')]] as const)
    await probe(name,async()=>{const rows=checked(await replace([value]));assert.equal(rows[0].end_time.slice(0,5),value.end_time);});
  await probe('equal times rejected without replacing prior rows',async()=>{const before=checked(await service.from('doctor_weekly_availability').select('*').eq('doctor_id',f.doctor));assert.ok((await replace([range(1,'09:00','09:00')])).error);assert.deepEqual(checked(await service.from('doctor_weekly_availability').select('*').eq('doctor_id',f.doctor)),before);});
  for(const [day,next,date] of [[1,2,'2027-01-05'],[6,0,'2027-01-03'],[0,1,'2027-01-04']] as const) {
    await probe(`overlap ${day}→${next} rejected and adjacency accepted`,async()=>{assert.ok((await replace([range(day,'20:00','02:00'),range(next,'01:00','04:00')])).error);assert.equal(checked(await replace([range(day,'20:00','02:00'),range(next,'02:00','04:00')])).length,2);});
    await probe(`inherited ${date} slot accepted by SQL`,async()=>{checked(await replace([range(day)]));assert.equal(checked(await manager.rpc('doctor_slot_is_available',{target_doctor:f.doctor,proposed_start:`${date}T00:30:00+05:30`,proposed_end:`${date}T01:00:00+05:30`})),true);});
  }
  for(const role of ['GENERAL_MANAGER','ASSISTANT_MANAGER','PSYCHOLOGIST']) await probe(`${role} explicit manager may edit outsourced availability`,async()=>{const db=await login(role);checked(await db.rpc('replace_clinician_availability',{target_doctor:f.doctor,ranges:[range(1)]}));await db.auth.signOut();});
  await probe('broad Director denied outsourced availability',async()=>{const db=await login('DIRECTOR');assert.ok((await db.rpc('replace_clinician_availability',{target_doctor:f.doctor,ranges:[range(1)]})).error);await db.auth.signOut();});
  await probe('text-only save keeps existing avatar',async()=>{const before=checked(await manager.rpc('clinician_profile',{target_doctor:f.doctor}));checked(await manager.rpc('save_clinician_profile',{target_doctor:f.doctor,patch:{professional_information:`QA overnight hotfix ${f.run}`}}));const after=checked(await manager.rpc('clinician_profile',{target_doctor:f.doctor}));assert.equal(after.avatar_url,before.avatar_url);});
  await probe('unlinked text-only profile save',async()=>{const before=checked(await manager.rpc('clinician_profile',{target_doctor:f.unlinked}));assert.equal(before.profile_id,null);checked(await manager.rpc('save_clinician_profile',{target_doctor:f.unlinked,patch:{professional_information:'QA unlinked text-only'}}));});
  const base=sharp({create:{width:8,height:8,channels:3,background:'#336699'}});
  for(const format of ['jpeg','png','webp'] as const) {
    const buffer=await base.clone().toFormat(format).toBuffer(); writeFileSync(`${dir}/valid.${format==='jpeg'?'jpg':format}`,buffer);
    if(format==='jpeg')writeFileSync(`${dir}/valid.jpeg`,buffer);
    await probe(`${format} manager storage upload and profile update`,async()=>{
      const profile=checked(await manager.rpc('clinician_profile',{target_doctor:f.doctor}));const path=`${profile.profile_id}/${f.run}-${randomUUID()}.${format==='jpeg'?'jpg':format}`;
      checked(await manager.storage.from('profile-photos').upload(path,buffer,{contentType:`image/${format}`}));f.photos.push(path);persist();
      checked(await manager.rpc('save_clinician_profile',{target_doctor:f.doctor,patch:{avatar_url:path}}));assert.equal(checked(await manager.rpc('clinician_profile',{target_doctor:f.doctor})).avatar_url,path);
      assert.ok(checked(await manager.storage.from('profile-photos').createSignedUrl(path,60)).signedUrl);
    });
  }
  writeFileSync(`${dir}/unsupported.gif`,Buffer.from('GIF89a'));
  writeFileSync(`${dir}/corrupt.jpg`,Buffer.from([255,216,255,224,0,16]));
  writeFileSync(`${dir}/oversize.jpg`,Buffer.alloc(5*1024*1024+1));
  checked(await replace([range(1)]));
  writeFileSync(`${dir}/api-results.json`,JSON.stringify({qaProject:'enylrvmjgbntkrgpqsfe',noAuthPatientAppointmentMutation:true,results},null,2));
  await manager.auth.signOut();
  console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL')}));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
async function cleanup() {
  assert.ok(f.before,'Recovery snapshot required');
  for(const saved of f.before.doctors) {
    const current=checked(await service.from('outsourced_doctors').select('doctor_name').eq('id',saved.id).single());assert.ok(current.doctor_name.startsWith(`QA P2 ${prior.run}`));
    checked(await service.from('outsourced_doctors').update({professional_information:saved.professional_information,doctor_name:saved.doctor_name,phone:saved.phone,qualification:saved.qualification,specialization:saved.specialization,updated_by:saved.updated_by}).eq('id',saved.id));
  }
  checked(await service.from('profiles').update(f.before.profile).eq('id',f.before.profile.id));
  checked(await service.from('doctor_weekly_availability').delete().in('doctor_id',[f.doctor,f.unlinked]));
  if(f.before.availability.length)checked(await service.from('doctor_weekly_availability').insert(f.before.availability));
  if(f.grants.length)checked(await service.from('user_permission_grants').update({revoked_at:new Date().toISOString()}).in('id',f.grants).is('revoked_at',null));
  writeFileSync(`${dir}/cleanup.json`,JSON.stringify({restoredDisposableProfilesAndAvailability:true,revokedTaskGrants:f.grants.length,retainedQaUploadedObjects:f.photos.length,authPatientAppointmentMutation:false,productionTouched:false},null,2));
  console.log('Restored QA fixture data, revoked only task grants; Auth/patients/appointments/production untouched.');
}
const mode=process.argv[2];
if(mode==='setup')await setup();else if(mode==='run')await run();else if(mode==='cleanup')await cleanup();else throw Error('Use setup, run or cleanup.');
