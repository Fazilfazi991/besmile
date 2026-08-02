import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
}));
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (ref !== 'ksmqzxncdvuxiabypjth') throw new Error(`Refusing unexpected project ${ref}.`);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const normalize = (value) => (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const [authResult, profilesResult, rolePermissionsResult, grantsResult, rolesResult] = await Promise.all([
  admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  admin.from('profiles').select('id,employee_code,full_name,email,role,status,designation,department:departments(name)').eq('status', 'active'),
  admin.from('role_permissions').select('role,permission:permissions(code)'),
  admin.from('user_permission_grants').select('profile_id,starts_at,expires_at,revoked_at,permission:permissions(code)').is('revoked_at', null),
  admin.from('roles').select('id,code,name'),
]);
for (const result of [authResult, profilesResult, rolePermissionsResult, grantsResult]) if (result.error) throw result.error;
const authIds = new Set(authResult.data.users.map((user) => user.id));
const grants = grantsResult.data || [];
const permissionRows = rolePermissionsResult.data || [];
const roles = (profilesResult.data || []).map((profile) => {
  const canonical = normalize(profile.role);
  const legacyPermissionRows = permissionRows.filter((row) => normalize(row.role) === canonical);
  const activeGrants = grants.filter((grant) => grant.profile_id === profile.id && (!grant.starts_at || new Date(grant.starts_at) <= new Date()) && (!grant.expires_at || new Date(grant.expires_at) > new Date()));
  return {
    employee_code: profile.employee_code,
    name: profile.full_name,
    email: profile.email,
    canonical_role: canonical,
    stored_role: profile.role,
    designation: profile.designation,
    department: profile.department?.name || null,
    auth_profile_linked: authIds.has(profile.id),
    role_permissions: [...new Set(legacyPermissionRows.map((row) => row.permission?.code).filter(Boolean))].sort(),
    direct_permissions: activeGrants.map((grant) => ({ code: grant.permission?.code, expires_at: grant.expires_at || null })).filter((grant) => grant.code).sort((a, b) => a.code.localeCompare(b.code)),
  };
});
const roleSummary = Object.entries(roles.reduce((summary, profile) => {
  (summary[profile.canonical_role] ||= []).push(profile);
  return summary;
}, {})).map(([role, entries]) => ({ role, active_accounts: entries.length, accounts: entries.map((entry) => ({ employee_code: entry.employee_code, name: entry.name, auth_profile_linked: entry.auth_profile_linked })) }));
console.log(JSON.stringify({ project: ref, role_catalogue: rolesResult.error ? { available: false } : rolesResult.data, active_role_summary: roleSummary, active_profiles: roles }, null, 2));
