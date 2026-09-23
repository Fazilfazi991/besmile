import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='enylrvmjgbntkrgpqsfe.supabase.co')throw Error('QA Tokyo only');
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const file='release-evidence/organization-fixtures.json';
const mode=process.argv[2]||'probe';
const ok=result=>{if(result.error)throw Error(result.error.message);return result.data;};
const client=()=>createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
if(mode==='setup'){
 fs.mkdirSync('release-evidence',{recursive:true});
 if(fs.existsSync(file))throw Error('Existing fixtures must be cleaned first');
 const fixture={password:randomUUID()+'aA9!',people:{},customDepartments:[],photoPaths:[]};
 const stamp=Date.now();
 fs.writeFileSync(file,JSON.stringify(fixture));
 for(const [key,role,designation,parent,status] of [
 ['chair','director','Chairman',null,'active'],['director','director','Director','chair','active'],['gm','general_manager','General Manager','director','active'],['staff','staff','Assistant Manager','gm','active'],['sales','guest_sales','Sales Coordinator','gm','active'],['child','staff','Senior Community Outreach and Business Development Coordinator','staff','active'],['inactive','staff','Former Employee','gm','inactive'],['admin','super_admin','QA Administrator',null,'active']]){
  const email=`org-${stamp}-${key}@qa.bsmile.local`;
  const auth=ok(await service.auth.admin.createUser({email,password:fixture.password,email_confirm:true}));
  fixture.people[key]={id:auth.user.id,email,full_name:`Org QA ${key==='child'?'Employee With A Deliberately Long Name For Layout Testing':key}`,designation,role};
  fs.writeFileSync(file,JSON.stringify(fixture));
  ok(await service.from('profiles').upsert({...fixture.people[key],status,manager_id:parent?fixture.people[parent].id:null,is_employee:true,workforce_visible:true,login_enabled:true}));
 }
 console.log('Created 8 disposable QA organization fixtures.');
}else if(mode==='probe'){
 const fixture=JSON.parse(fs.readFileSync(file,'utf8'));const p=fixture.people;const results=[];
 const check=(name,fn)=>fn().then(()=>{results.push({name,pass:true});console.log('PASS '+name);});
 const sessions={};
 try{
 for(const key of ['director','gm','staff','sales','admin']){sessions[key]=client();ok(await sessions[key].auth.signInWithPassword({email:p[key].email,password:fixture.password}));}
 const update=(db,key,manager,designation=p[key].designation,department=null)=>db.rpc('update_organization_employee',{employee_id:p[key].id,reporting_manager_id:manager?p[manager].id:null,employee_department_id:department,employee_designation:designation});
 await check('Active directory and leadership relationships',async()=>{const rows=ok(await sessions.staff.rpc('organization_directory'));assert(rows.some(x=>x.id===p.chair.id));assert(!rows.some(x=>x.id===p.inactive.id));assert.equal(rows.find(x=>x.id===p.director.id).manager_id,p.chair.id);assert.equal(rows.find(x=>x.id===p.gm.id).manager_id,p.director.id);assert(rows.every(x=>!('email'in x)&&!('role'in x)&&!x.can_edit));});
 await check('Director can edit real organization fields',async()=>{ok(await update(sessions.director,'staff','gm','Custom QA Position'));assert.equal(ok(await service.from('profiles').select('designation').eq('id',p.staff.id).single()).designation,'Custom QA Position');ok(await update(sessions.director,'staff','gm'));});
 await check('Director can edit protected leadership structure without role changes',async()=>{ok(await update(sessions.director,'director','chair'));assert.equal(ok(await service.from('profiles').select('role,designation').eq('id',p.director.id).single()).role,'director');});
 await check('Admin and GM ordinary employee editing allowed',async()=>{ok(await update(sessions.admin,'staff','gm'));ok(await update(sessions.gm,'staff','gm'));});
 await check('Ordinary employee and Sales Coordinator edits blocked',async()=>{for(const key of ['staff','sales'])assert((await update(sessions[key],'staff','gm','Forbidden')).error);});
 await check('Anonymous directory and mutation blocked',async()=>{const anon=client();assert((await anon.rpc('organization_directory')).error);assert((await update(anon,'staff','gm')).error);});
 await check('Self manager, indirect cycle, Chairman subordination, inactive manager blocked',async()=>{for(const [key,parent]of[['staff','staff'],['gm','child'],['chair','director'],['staff','inactive']])assert((await update(sessions.director,key,parent)).error);});
 await check('Move employee between managers persists',async()=>{ok(await update(sessions.director,'child','gm'));assert.equal(ok(await sessions.staff.rpc('organization_directory')).find(x=>x.id===p.child.id).manager_id,p.gm.id);ok(await update(sessions.director,'child','staff'));});
 await check('Canonical departments and custom persistence',async()=>{const ds=ok(await sessions.director.from('departments').select('id,name'));for(const name of ['Business Development','Marketing'])assert(ds.some(d=>d.name===name));const name=`Org QA Custom ${Date.now()}`;const id=ok(await sessions.director.rpc('create_employee_department',{department_name:name}));fixture.customDepartments.push(id);fs.writeFileSync(file,JSON.stringify(fixture));assert.equal(ok(await sessions.director.rpc('create_employee_department',{department_name:name.toLowerCase()})),id);assert((await sessions.staff.rpc('create_employee_department',{department_name:'Forbidden QA'})).error);assert((await sessions.director.rpc('create_employee_department',{department_name:'Other'})).error);ok(await update(sessions.director,'staff','gm',p.staff.designation,id));assert.equal(ok(await sessions.staff.rpc('organization_directory')).find(x=>x.id===p.staff.id).department_name,name);});
 await check('Current private avatar readable by coworkers, replacement and removal synchronized',async()=>{const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=','base64');const photoPath=`${p.staff.id}/org-${randomUUID()}.png`;ok(await sessions.staff.storage.from('profile-photos').upload(photoPath,png,{contentType:'image/png'}));fixture.photoPaths.push(photoPath);fs.writeFileSync(file,JSON.stringify(fixture));ok(await sessions.staff.from('profiles').update({avatar_url:photoPath}).eq('id',p.staff.id));assert.equal(ok(await sessions.sales.rpc('organization_directory')).find(x=>x.id===p.staff.id).avatar_url,photoPath);assert(ok(await sessions.sales.storage.from('profile-photos').createSignedUrl(photoPath,300)).signedUrl);const replacement=`${p.staff.id}/org-${randomUUID()}.png`;ok(await sessions.staff.storage.from('profile-photos').upload(replacement,png,{contentType:'image/png'}));fixture.photoPaths.push(replacement);fs.writeFileSync(file,JSON.stringify(fixture));ok(await sessions.staff.from('profiles').update({avatar_url:replacement}).eq('id',p.staff.id));assert.equal(ok(await sessions.sales.rpc('organization_directory')).find(x=>x.id===p.staff.id).avatar_url,replacement);assert((await sessions.sales.storage.from('profile-photos').createSignedUrl(photoPath,300)).error);ok(await sessions.staff.from('profiles').update({avatar_url:null}).eq('id',p.staff.id));assert.equal(ok(await sessions.sales.rpc('organization_directory')).find(x=>x.id===p.staff.id).avatar_url,null);assert((await sessions.sales.storage.from('profile-photos').createSignedUrl(photoPath,300)).error);});
 fs.writeFileSync('release-evidence/organization-security.json',JSON.stringify(results,null,2));
 }finally{for(const db of Object.values(sessions))await db.auth.signOut();}
}else if(mode==='cleanup'){
 const fixture=JSON.parse(fs.readFileSync(file,'utf8'));const ids=Object.values(fixture.people).map(p=>p.id);
 const current=ok(await service.from('profiles').select('avatar_url').in('id',ids));
 const photoPaths=[...new Set([...fixture.photoPaths,...current.map(p=>p.avatar_url).filter(Boolean)])];
 ok(await service.from('profiles').update({manager_id:null,avatar_url:null}).in('id',ids));
 if(photoPaths.length)ok(await service.storage.from('profile-photos').remove(photoPaths));
 ok(await service.from('employee_activity_logs').delete().in('profile_id',ids));
 ok(await service.from('employee_activity_logs').delete().in('actor_id',ids));
 ok(await service.from('audit_logs').delete().in('actor_id',ids));
 for(const id of ids)ok(await service.auth.admin.deleteUser(id));
 for(const id of fixture.customDepartments)ok(await service.from('departments').delete().eq('id',id));
 assert.equal(ok(await service.from('profiles').select('id').in('id',ids)).length,0);
 assert.equal(ok(await service.from('departments').select('id').in('id',fixture.customDepartments)).length,0);
 fs.unlinkSync(file);console.log('Disposable organization fixtures cleaned.');
}
