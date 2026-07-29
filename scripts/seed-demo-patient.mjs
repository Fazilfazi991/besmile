import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
if (existsSync('.env.local')) for (const line of readFileSync('.env.local','utf8').split(/\r?\n/)) { const match=line.match(/^([^#=]+)=(.*)$/); if(match&&!process.env[match[1]]) process.env[match[1]]=match[2]; }
if (process.env.ALLOW_DEMO_PATIENT_SEED !== 'true') throw new Error('Skipped: set ALLOW_DEMO_PATIENT_SEED=true to seed demo data explicitly.');
if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('Skipped: demo patient seeding is disabled in production.');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!url||!key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}); const number='DEMO-PAT-001';
const existing=await admin.from('patients').select('id').eq('patient_number',number).maybeSingle(); if(existing.error) throw existing.error;
if(existing.data) console.log(`Demo patient already existed: ${existing.data.id} (${number}).`);
else {
  const profiles=await admin.from('profiles').select('id,designation,role').eq('status','active').order('created_at').limit(100); if(profiles.error) throw profiles.error;
  const psychologist=profiles.data.find(p=>/psychologist|counsellor/i.test(p.designation||'')); const actor=psychologist?.id || profiles.data[0]?.id || null;
  const created=await admin.from('patients').insert({patient_number:number,full_name:'Amina Rahman',status:'active',date_of_birth:'1994-08-14',gender:'Female',phone:'+971 50 000 0001',email:'amina.demo@bsmile.test',nationality:'Indian',preferred_language:'English',address:'Dubai, UAE',emergency_contact_name:'Sameer Rahman',emergency_contact_relationship:'Brother',emergency_contact_phone:'+971 50 000 0002',source:'Referral',tags:['Demo Patient','Online Session'],is_demo:true,assigned_psychologist_id:psychologist?.id||null,created_by:actor}).select('id').single(); if(created.error) throw created.error;
  const now=new Date(),past=new Date(now),future=new Date(now);past.setDate(past.getDate()-7);future.setDate(future.getDate()+7);
  const sessions=await admin.from('patient_sessions').insert([{patient_id:created.data.id,appointment_at:past.toISOString(),assigned_psychologist_id:psychologist?.id||null,session_type:'Initial consultation',session_number:1,duration_minutes:60,attendance_status:'completed',administrative_summary:'Initial consultation completed. Demo record only.',created_by:actor},{patient_id:created.data.id,appointment_at:future.toISOString(),assigned_psychologist_id:psychologist?.id||null,session_type:'Follow-up',session_number:2,duration_minutes:45,attendance_status:'scheduled',created_by:actor}]);if(sessions.error)throw sessions.error;
  if(actor){const note=await admin.from('patient_notes').insert({patient_id:created.data.id,note_type:'administrative',content:'Patient prefers evening appointments. This is demo data only.',visibility:'general_staff',created_by:actor});if(note.error)throw note.error;} else console.log('No active staff profile found; administrative demo note was skipped.');
  console.log(`Created demo patient: ${created.data.id} (${number}).`);
}
