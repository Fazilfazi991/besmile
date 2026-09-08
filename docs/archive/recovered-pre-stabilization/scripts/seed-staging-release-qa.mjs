import { createClient } from '@supabase/supabase-js'

const expectedRef = 'utwlmwjuisvensqxuuve'
const expectedHost = `${expectedRef}.supabase.co`
const url = process.env.STAGING_SUPABASE_URL
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_KEY
const password = process.env.STAGING_QA_PASSWORD

if (!url || new URL(url).host !== expectedHost) throw new Error('Refusing to seed a non-staging Supabase project.')
if (!serviceKey || !password) throw new Error('Missing staging-only credentials.')
if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') throw new Error('Refusing to seed from a production runtime.')

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const prefix = 'FINAL QA'
const suffix = '20260815@qa.bsmile.local'
const accounts = [
  { key: 'director', fullName: `${prefix} Director`, email: `director-${suffix}`, role: 'director', designation: 'Director', department: 'Management' },
  { key: 'gm', fullName: `${prefix} GM`, email: `gm-${suffix}`, role: 'general_manager', designation: 'General Manager', department: 'Management' },
  { key: 'assistantManager', fullName: `${prefix} Assistant Manager`, email: `assistant-manager-${suffix}`, role: 'staff', designation: 'Assistant Manager', department: 'Operations' },
  { key: 'psychologist', fullName: `${prefix} Psychologist`, email: `psychologist-${suffix}`, role: 'psychologist', designation: 'Psychologist', department: 'Psychology' },
  { key: 'salesCoordinator', fullName: `${prefix} Sales Coordinator`, email: `sales-coordinator-${suffix}`, role: 'guest_sales', designation: 'Sales Coordinator', department: 'Operations' },
  { key: 'internAllowed', fullName: `${prefix} Intern Allowed`, email: `intern-allowed-${suffix}`, role: 'intern', designation: 'Intern', department: 'Operations' },
  { key: 'internDenied', fullName: `${prefix} Intern Denied`, email: `intern-denied-${suffix}`, role: 'intern', designation: 'Intern', department: 'Operations' },
]

const { data: authList, error: authListError } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (authListError) throw authListError
const ids = new Map()
for (const account of accounts) {
  let user = authList.users.find((candidate) => candidate.email === account.email)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, qa_account: true, qa_prefix: 'FINAL-QA-STAGING-20260815' },
    })
    if (error) throw error
    user = data.user
  }
  ids.set(account.key, user.id)
}

const { data: departments, error: departmentError } = await admin.from('departments').select('id,name').in('name', [...new Set(accounts.map((account) => account.department))])
if (departmentError) throw departmentError
const departmentIds = new Map(departments.map((department) => [department.name, department.id]))

for (const account of accounts) {
  const managerId = account.key === 'gm'
    ? ids.get('director')
    : ['assistantManager', 'psychologist', 'salesCoordinator', 'internAllowed', 'internDenied'].includes(account.key)
      ? ids.get('gm')
      : null
  const { error } = await admin.from('profiles').upsert({
    id: ids.get(account.key),
    full_name: account.fullName,
    email: account.email,
    role: account.role,
    designation: account.designation,
    department_id: departmentIds.get(account.department),
    manager_id: managerId,
    status: 'active',
    is_employee: true,
    workforce_visible: true,
    login_enabled: true,
  }, { onConflict: 'id' })
  if (error) throw error
}

const grantPlan = new Map([
  ['assistantManager', ['tasks.view_self', 'tasks.assign', 'meetings.view', 'meetings.create', 'documents.view', 'crm.view_team', 'chat.use', 'announcements.view']],
  ['salesCoordinator', ['tasks.view_self', 'crm.view_assigned', 'chat.use', 'announcements.view', 'ideas.view', 'ideas.create', 'ideas.comment', 'ideas.support']],
  ['internAllowed', ['leads.create', 'chat.use', 'tasks.view_self', 'announcements.view', 'ideas.view', 'ideas.create', 'ideas.comment', 'ideas.support']],
  ['internDenied', ['chat.use', 'tasks.view_self', 'announcements.view', 'ideas.view', 'ideas.create', 'ideas.comment', 'ideas.support']],
])
const allCodes = [...new Set([...grantPlan.values()].flat())]
const { data: permissions, error: permissionError } = await admin.from('permissions').select('id,code').in('code', allCodes)
if (permissionError) throw permissionError
const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]))
if (permissionIds.size !== allCodes.length) throw new Error('A requested real permission code is absent from staging.')

const profileIds = [...ids.values()]
const { error: clearGrantError } = await admin.from('user_permission_grants').delete().in('profile_id', profileIds)
if (clearGrantError) throw clearGrantError
const grantRows = []
for (const [accountKey, codes] of grantPlan) {
  for (const code of codes) {
    grantRows.push({
      profile_id: ids.get(accountKey),
      permission_id: permissionIds.get(code),
      granted_by: ids.get('gm'),
      starts_at: new Date().toISOString(),
      expires_at: null,
      reason: 'FINAL-QA-STAGING-20260815 release validation fixture',
    })
  }
}
const { error: grantError } = await admin.from('user_permission_grants').insert(grantRows)
if (grantError) throw grantError

console.log(JSON.stringify({ seeded: accounts.map(({ key, email, role }) => ({ key, email, role })), prefix: 'FINAL-QA-STAGING-20260815' }))


