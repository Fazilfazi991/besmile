import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');

const apply = process.argv.includes('--apply');
const inviteMissing = process.argv.includes('--invite-missing');
const createMissingWithoutEmail = process.argv.includes('--create-missing-no-email');
const staff = [
  { employee_code: 'A001', full_name: 'Muhammad Faiz AU', email: 'bsmile.gm@gmail.com', phone: '9207626952', department: 'Management', designation: 'General Manager', joining_date: null, role: 'general_manager' },
  { employee_code: 'A002', full_name: 'Diya Anthikat', email: 'diyaadminbsmile@gmail.com', phone: '8779665569', department: 'Administration', designation: 'Social Worker', joining_date: '2026-01-26', role: 'social_worker' },
  { employee_code: 'A004', full_name: 'Aiswarya P', email: 'aiswaryabsmile@gmail.com', phone: '8606774707', department: 'Psychology', designation: 'Psychologist', joining_date: '2026-02-15', role: 'psychologist' },
];
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const usersByEmail = new Map(authData.users.map((user) => [(user.email || '').toLowerCase(), user]));
const missing = staff.filter((employee) => !usersByEmail.has(employee.email));

if (missing.length) {
  console.log(`Missing Auth accounts: ${missing.map((employee) => employee.email).join(', ')}`);
  if (inviteMissing) {
    for (const employee of missing) {
      const { error } = await admin.auth.admin.inviteUserByEmail(employee.email, { data: { full_name: employee.full_name } });
      if (error) throw error;
      console.log(`Invited ${employee.email}.`);
    }
    console.log('Invitations sent. Re-run without flags to verify before applying profiles.');
  } else if (createMissingWithoutEmail) {
    for (const employee of missing) {
      const { data, error } = await admin.auth.admin.createUser({ email: employee.email, email_confirm: false, user_metadata: { full_name: employee.full_name, password_reset_required: true } });
      if (error) throw error;
      console.log(`Created unconfirmed Auth account for ${employee.email} (${data.user.id}) without sending email.`);
    }
    console.log('Accounts created. Use the approved password-reset flow before first sign-in, then rerun without flags to verify.');
  } else {
    console.log('Run with --invite-missing, or --create-missing-no-email after an invitation rate-limit, then rerun with --apply after every account exists.');
    process.exitCode = 2;
  }
} else {
  const { data: departments, error: departmentError } = await admin.from('departments').select('id,name').in('name', staff.map((employee) => employee.department));
  if (departmentError) throw departmentError;
  const departmentIds = new Map(departments.map((department) => [department.name, department.id]));
  if (departmentIds.size !== new Set(staff.map((employee) => employee.department)).size) throw new Error('One or more required departments are missing.');
  const { data: existingProfiles, error: profileError } = await admin.from('profiles').select('id,email,employee_code,joining_date,employment_type').or(`email.in.(${staff.map((employee) => `"${employee.email}"`).join(',')}),employee_code.in.(${staff.map((employee) => `"${employee.employee_code}"`).join(',')})`);
  if (profileError) throw profileError;
  for (const employee of staff) {
    const user = usersByEmail.get(employee.email);
    const matches = existingProfiles.filter((profile) => profile.email?.toLowerCase() === employee.email || profile.employee_code === employee.employee_code);
    const conflicting = matches.find((profile) => profile.id !== user.id);
    if (conflicting) throw new Error(`${employee.employee_code} conflicts with an employee profile connected to another Auth user. Resolve it manually before syncing.`);
    const existing = matches.find((profile) => profile.id === user.id);
    const managerId = employee.employee_code === 'A001' ? undefined : usersByEmail.get('bsmile.gm@gmail.com').id;
    const payload = { id: user.id, employee_code: employee.employee_code, full_name: employee.full_name, email: employee.email, phone: employee.phone, department_id: departmentIds.get(employee.department), designation: employee.designation, joining_date: employee.joining_date ?? existing?.joining_date ?? null, employment_type: existing?.employment_type ?? null, role: employee.role, status: 'active', ...(managerId ? { manager_id: managerId } : {}) };
    if (!apply) {
      console.log(JSON.stringify({ employee_code: employee.employee_code, auth_id: user.id, email: user.email, auth_state: user.email_confirmed_at ? 'confirmed' : user.invited_at ? 'invited' : 'unconfirmed', identities: user.identities?.length || 0, profile_action: existing ? 'update' : 'insert', department: employee.department, designation: employee.designation, role: employee.role, manager_id: managerId || null, joining_date: payload.joining_date, employment_type: payload.employment_type, identity_conflict: false }));
      continue;
    }
    const { error } = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    console.log(`Synced ${employee.employee_code} (${employee.email}).`);
  }
}
