import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]; }));
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (projectRef !== 'ksmqzxncdvuxiabypjth') throw new Error(`Refusing to audit unexpected project ${projectRef}.`);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const emails = ['bsmile.gm@gmail.com', 'diyaadminbsmile@gmail.com', 'aiswaryabsmile@gmail.com'];
const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const authAudit = emails.map((email) => {
  const matches = authData.users.filter((user) => user.email?.toLowerCase() === email);
  return { email, count: matches.length, users: matches.map((user) => ({ id: user.id, state: user.email_confirmed_at ? 'confirmed' : user.invited_at ? 'invited' : 'unconfirmed', identities: user.identities?.length || 0 })) };
});
const { data: profiles, error: profileError } = await admin.from('profiles').select('id,employee_code,full_name,email,phone,designation,joining_date,employment_type,role,status,manager_id,department:departments(name)').in('email', emails);
if (profileError) throw profileError;
const { data: holidays, error: holidayError } = await admin.from('holidays').select('holiday_date,name,is_active').eq('is_active', true);
if (holidayError) throw holidayError;
const { data: awareness, error: awarenessError } = await admin.from('awareness_events').select('name,recurrence_rule,is_active').eq('is_active', true);
if (awarenessError) throw awarenessError;
const permissionCodes = ['patients.view_assigned', 'patients.view_all', 'sales.view', 'sales.edit', 'sales.manage_status', 'sales.documents.view', 'sales.documents.manage'];
const { data: permissions, error: permissionError } = await admin.from('permissions').select('code').in('code', permissionCodes);
if (permissionError) throw permissionError;
const schemaChecks = {};
for (const table of ['patient_access_assignments', 'crm_sales_documents']) {
  const { error } = await admin.from(table).select('*', { count: 'exact', head: true });
  schemaChecks[table] = error ? { available: false, error: error.message } : { available: true };
}
const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
if (bucketError) throw bucketError;
const { data: rolePermissionRows, error: rolePermissionError } = await admin.from('role_permissions').select('role,permission:permissions(code)');
if (rolePermissionError) throw rolePermissionError;
const relevantRoles = ['General Manager', 'Psychologist', 'Social Worker', 'Intern', 'Guest – Sales'];
const rolePermissions = Object.fromEntries(relevantRoles.map((role) => [role, rolePermissionRows.filter((row) => row.role === role).map((row) => row.permission?.code).filter(Boolean).sort()]));
const { data: restrictedProfiles, error: restrictedProfileError } = await admin.from('profiles').select('id,email,role,status').in('role', ['intern', 'guest_sales']).eq('status', 'active');
if (restrictedProfileError) throw restrictedProfileError;
const authIds = new Set(authData.users.map((user) => user.id));
const duplicateHolidayDates = Object.entries(holidays.reduce((counts, row) => ({ ...counts, [row.holiday_date]: (counts[row.holiday_date] || 0) + 1 }), {})).filter(([, count]) => count > 1);
console.log(JSON.stringify({ projectRef, auth: authAudit, profiles, profileCounts: emails.map((email) => ({ email, count: profiles.filter((profile) => profile.email?.toLowerCase() === email).length })), restrictedTestAccounts: restrictedProfiles.map((profile) => ({ role: profile.role, profile_id: profile.id, auth_account_exists: authIds.has(profile.id) })), rolePermissions, calendar: { activeHolidays: holidays.length, duplicateHolidayDates, activeAwarenessEvents: awareness.length, ocdAwarenessWeek: awareness.find((event) => event.name === 'OCD Awareness Week') || null }, migration0042: { permissionsPresent: permissions.map((permission) => permission.code).sort(), schemaChecks, salesDocumentsBucket: buckets.find((bucket) => bucket.id === 'sales-documents') ? { exists: true, public: buckets.find((bucket) => bucket.id === 'sales-documents').public } : { exists: false } } }, null, 2));
