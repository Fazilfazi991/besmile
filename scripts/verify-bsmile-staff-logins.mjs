import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]; }));
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (projectRef !== 'ksmqzxncdvuxiabypjth' || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Verified project URL and anonymous key are required.');
const approvedTemporaryCredential = process.env.QA_AUDIT_PASSWORD || env.SEED_USER_TEMP_PASSWORD;
if (!approvedTemporaryCredential) throw new Error('Set QA_AUDIT_PASSWORD or SEED_USER_TEMP_PASSWORD before verifying staff logins.');
const staff = [
  { email: 'bsmile.gm@gmail.com', id: 'e64c5750-b585-4cab-9478-2c1fbad3b26e', role: 'general_manager', route: '/admin', landingPermission: 'leave.approve' },
  { email: 'diyaadminbsmile@gmail.com', id: 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5', role: 'staff', route: '/employee/dashboard', landingPermission: 'dashboard.view' },
  { email: 'aiswaryabsmile@gmail.com', id: '4096a95f-970b-4542-8f18-cf5dd6a66150', role: 'psychologist', route: '/employee/patients', landingPermission: 'patients.view' },
];

for (const expected of staff) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email: expected.email, password: approvedTemporaryCredential });
  if (signInError) throw new Error(`${expected.email}: login failed.`);
  if (signedIn.user.id !== expected.id || signedIn.user.email?.toLowerCase() !== expected.email) throw new Error(`${expected.email}: authenticated identity mismatch.`);
  const { data: profile, error: profileError } = await client.from('profiles').select('id,email,role,status').eq('id', expected.id).single();
  if (profileError || profile.role !== expected.role || profile.status !== 'active') throw new Error(`${expected.email}: authenticated profile verification failed.`);
  const { data: dashboardAllowed, error: permissionError } = await client.rpc('has_permission', { permission_code: expected.landingPermission || 'dashboard.view' });
  if (permissionError) throw new Error(`${expected.email}: dashboard permission verification failed.`);
  if (!dashboardAllowed) throw new Error(`${expected.email}: landing route permission verification failed.`);
  console.log(`${expected.email} | ${expected.id} | login successful | role ${profile.role} | route ${expected.route} | landing permitted`);
  await client.auth.signOut();
}
