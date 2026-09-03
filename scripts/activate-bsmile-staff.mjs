import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Required server-side activation environment variables are missing.');
const approvedTemporaryCredential = process.env.SEED_USER_TEMP_PASSWORD;
if (!approvedTemporaryCredential) throw new Error('Set SEED_USER_TEMP_PASSWORD before activating staff accounts.');
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (projectRef !== 'ksmqzxncdvuxiabypjth') throw new Error(`Refusing to update unexpected project ${projectRef}.`);

const apply = process.argv.includes('--apply');
const expected = [
  { email: 'bsmile.gm@gmail.com', id: 'e64c5750-b585-4cab-9478-2c1fbad3b26e' },
  { email: 'diyaadminbsmile@gmail.com', id: 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5' },
  { email: 'aiswaryabsmile@gmail.com' },
];
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

for (const staff of expected) {
  const matches = listed.users.filter((user) => user.email?.trim().toLowerCase() === staff.email);
  if (matches.length > 1) throw new Error(`${staff.email}: duplicate Auth accounts found; no changes applied.`);
  let user = matches[0];
  if (user && staff.id && user.id !== staff.id) throw new Error(`${staff.email}: Auth ID conflict; no changes applied.`);
  if (user && user.identities && user.identities.length > 1) throw new Error(`${staff.email}: conflicting identities found; no changes applied.`);
  const existing = Boolean(user);
  if (!apply) {
    console.log(`${staff.email} | ${user?.id || 'create on apply'} | ${existing ? 'existing' : 'created on apply'} | ${user?.email_confirmed_at ? 'already confirmed' : 'newly confirmed on apply'} | password update pending`);
    continue;
  }
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({ email: staff.email, password: approvedTemporaryCredential, email_confirm: true });
    if (error) throw new Error(`${staff.email}: ${error.message}`);
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true, password: approvedTemporaryCredential });
    if (error) throw new Error(`${staff.email}: ${error.message}`);
    user = data.user;
  }
  const { data: verified, error: verifyError } = await supabase.auth.admin.getUserById(user.id);
  if (verifyError) throw new Error(`${staff.email}: ${verifyError.message}`);
  if (verified.user.email?.trim().toLowerCase() !== staff.email || !verified.user.email_confirmed_at || verified.user.banned_until) throw new Error(`${staff.email}: post-update verification failed.`);
  console.log(`${staff.email} | ${verified.user.id} | ${existing ? 'existing' : 'created'} | ${existing && matches[0].email_confirmed_at ? 'already confirmed' : 'newly confirmed'} | password updated successfully`);
}
