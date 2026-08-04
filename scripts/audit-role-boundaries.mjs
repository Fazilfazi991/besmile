import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
}));
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (ref !== 'ksmqzxncdvuxiabypjth') throw new Error(`Refusing unexpected project ${ref}.`);
const password = env.SEED_USER_TEMP_PASSWORD;
if (!password) throw new Error('A controlled QA password is required.');

const accounts = [
  ['super_admin', 'super-admin@qa.bsmile.local'],
  ['chairman', 'chairman@qa.bsmile.local'],
  ['director', 'director@qa.bsmile.local'],
  ['general_manager', 'bsmile.gm@gmail.com'],
  ['staff', 'diyaadminbsmile@gmail.com'],
  ['psychologist', 'aiswaryabsmile@gmail.com'],
  ['intern', 'ayishamuneer.dxb@gmail.com'],
  ['guest_sales', 'fazil4fazi@gmail.com'],
  ['staff', 'staff@qa.bsmile.local'],
];
const codes = ['admin.access', 'roles.manage', 'permissions.manage', 'audit.view', 'employees.create', 'leave.approve', 'payroll.view', 'finance.dashboard.view', 'leads.view', 'patients.view', 'patients.view_assigned', 'attendance.self', 'leave.self', 'tasks.assign', 'chat.use'];
const results = [];
for (const [expectedRole, email] of accounts) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) { results.push({ expected_role: expectedRole, email, auth: 'failed', error: signedIn.error.message }); continue; }
  const profile = await client.from('profiles').select('role,status').eq('id', signedIn.data.user.id).single();
  const permissions = Object.fromEntries(await Promise.all(codes.map(async (code) => {
    const response = await client.rpc('has_permission', { permission_code: code });
    return [code, response.error ? { error: response.error.message } : response.data];
  })));
  results.push({ expected_role: expectedRole, email, auth: 'ok', profile_role: profile.data?.role, active: profile.data?.status === 'active', permissions });
  await client.auth.signOut();
}
console.log(JSON.stringify({ project: ref, results }, null, 2));
