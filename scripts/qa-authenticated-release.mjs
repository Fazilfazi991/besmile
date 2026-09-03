import { createClient } from '@supabase/supabase-js';

const url = process.env.QA_SUPABASE_URL;
const anonKey = process.env.QA_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Set QA_SUPABASE_URL and QA_SUPABASE_ANON_KEY.');
const productionRef = 'ksmqzxncdvuxiabypjth';
const projectRef = new URL(url).hostname.split('.')[0];
const writesRequested = process.env.QA_ALLOW_WRITES === 'true';
if (projectRef === productionRef && writesRequested) throw new Error('Safety stop: authenticated QA writes are forbidden on Production.');

const identities = [
  ['director', 'QA_DIRECTOR_EMAIL', 'QA_DIRECTOR_PASSWORD'],
  ['general_manager', 'QA_GENERAL_MANAGER_EMAIL', 'QA_GENERAL_MANAGER_PASSWORD'],
  ['administration_admin', 'QA_ADMINISTRATION_ADMIN_EMAIL', 'QA_ADMINISTRATION_ADMIN_PASSWORD'],
  ['finance', 'QA_FINANCE_EMAIL', 'QA_FINANCE_PASSWORD'],
  ['psychologist', 'QA_PSYCHOLOGIST_EMAIL', 'QA_PSYCHOLOGIST_PASSWORD'],
  ['employee', 'QA_EMPLOYEE_EMAIL', 'QA_EMPLOYEE_PASSWORD'],
];
const permissionCodes = ['employees.manage', 'leave.approve', 'appointments.manage', 'finance.dashboard.view', 'payroll.view', 'chat.use', 'documents.view', 'permissions.manage', 'reports.view'];
const report = { projectRef, mode: writesRequested ? 'staging-write' : 'read-only', generatedAt: new Date().toISOString(), identities: [] };
for (const [expectedRole, emailKey, passwordKey] of identities) {
  const email = process.env[emailKey];
  const password = process.env[passwordKey];
  if (!email || !password) { report.identities.push({ expectedRole, status: 'SKIPPED', reason: `Missing ${emailKey}/${passwordKey}` }); continue; }
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const auth = await client.auth.signInWithPassword({ email, password });
  if (auth.error) { report.identities.push({ expectedRole, status: 'AUTH_FAILED', error: auth.error.message }); continue; }
  const profile = await client.from('profiles').select('role,status').eq('id', auth.data.user.id).single();
  const permissions = {};
  for (const permission_code of permissionCodes) {
    const result = await client.rpc('has_permission', { permission_code });
    permissions[permission_code] = result.error ? `ERROR:${result.error.code ?? 'unknown'}` : result.data;
  }
  report.identities.push({ expectedRole, status: profile.error ? 'PROFILE_FAILED' : 'READY', actualRole: profile.data?.role, active: profile.data?.status === 'active', roleMatches: profile.data?.role === expectedRole, permissions });
  await client.auth.signOut({ scope: 'local' });
}
// Write fixtures are intentionally not automatic. Use a BSMILE_QA_<timestamp>
// prefix and review the staging cleanup plan before enabling a workflow case.
console.log(JSON.stringify(report, null, 2));
