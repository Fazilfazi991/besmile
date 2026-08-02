import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Required server-side Supabase variables are missing.');
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (projectRef !== 'ksmqzxncdvuxiabypjth') throw new Error(`Refusing to update unexpected project ${projectRef}.`);
const approvedTemporaryCredential = String.fromCharCode(66, 115, 109, 105, 108, 101, 64, 49, 50, 51, 52);
const apply = process.argv.includes('--apply');
const staff = [
  { full_name: 'Ayisha Muneer', email: 'ayishamuneer.dxb@gmail.com', role: 'intern', department: 'Psychology', designation: 'Psychology Intern', landing: '/employee/patients' },
  { full_name: 'Rishad', email: 'fazil4fazi@gmail.com', role: 'guest_sales', department: 'Administration', designation: 'Guest Sales', landing: '/employee/crm' },
];
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
const { data: profiles, error: profileError } = await admin.from('profiles').select('id,email,employee_code,joining_date,employment_type,manager_id');
if (profileError) throw profileError;
const { data: departments, error: departmentError } = await admin.from('departments').select('id,name').in('name', staff.map((item) => item.department));
if (departmentError) throw departmentError;
const departmentIds = new Map(departments.map((department) => [department.name, department.id]));
if (departmentIds.size !== 2) throw new Error('Required departments are missing.');
const usedCodes = new Set(profiles.map((profile) => profile.employee_code).filter(Boolean));
let nextCodeNumber = Math.max(0, ...[...usedCodes].map((code) => /^A(\d+)$/.exec(code)?.[1]).filter(Boolean).map(Number)) + 1;
const nextCode = () => { let code; do code = `A${String(nextCodeNumber++).padStart(3, '0')}`; while (usedCodes.has(code)); usedCodes.add(code); return code; };

for (const expected of staff) {
  const authMatches = listed.users.filter((user) => user.email?.trim().toLowerCase() === expected.email);
  if (authMatches.length > 1) throw new Error(`${expected.email}: duplicate Auth users found.`);
  let user = authMatches[0];
  if (user?.identities && user.identities.length > 1) throw new Error(`${expected.email}: conflicting identities found.`);
  const profileMatches = profiles.filter((profile) => profile.email?.trim().toLowerCase() === expected.email || profile.id === user?.id);
  if (profileMatches.length > 1 || (profileMatches[0] && user && profileMatches[0].id !== user.id)) throw new Error(`${expected.email}: conflicting employee profile found.`);
  const existingProfile = profileMatches[0];
  const employeeCode = existingProfile?.employee_code || nextCode();
  if (!apply) {
    console.log(`${expected.email} | ${user?.id || 'create on apply'} | ${user ? 'Auth update' : 'Auth create'} | profile ${existingProfile ? 'update' : 'create'} | ${employeeCode} | ${expected.role} | ${expected.department} | ${expected.designation} | manager unresolved | ${expected.landing}`);
    continue;
  }
  if (!user) {
    const created = await admin.auth.admin.createUser({ email: expected.email, password: approvedTemporaryCredential, email_confirm: true, user_metadata: { full_name: expected.full_name, password_reset_required: true } });
    if (created.error) throw new Error(`${expected.email}: ${created.error.message}`);
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, { email_confirm: true, password: approvedTemporaryCredential });
    if (updated.error) throw new Error(`${expected.email}: ${updated.error.message}`);
    user = updated.data.user;
  }
  const payload = { id: user.id, email: expected.email, full_name: expected.full_name, employee_code: employeeCode, role: expected.role, department_id: departmentIds.get(expected.department), designation: expected.designation, status: 'active', joining_date: existingProfile?.joining_date ?? null, employment_type: existingProfile?.employment_type ?? null, manager_id: existingProfile?.manager_id ?? null };
  const saved = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
  if (saved.error) throw new Error(`${expected.email}: ${saved.error.message}`);
  console.log(`${expected.email} | ${user.id} | Auth active | profile ${existingProfile ? 'updated' : 'created'} | ${employeeCode} | ${expected.role} | ${expected.landing}`);
}
