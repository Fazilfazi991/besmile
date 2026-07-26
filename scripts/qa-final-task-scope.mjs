import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

process.on('uncaughtException', error => {
  console.error('QA task-scope check failed:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
  process.exit(1);
});

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' || process.env.ALLOW_QA_SEED === 'false') throw new Error('QA RLS checks are disabled in production.');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.QA_SEED_PASSWORD || process.env.SEED_USER_TEMP_PASSWORD;
if (!url || !serviceKey || !password) throw new Error('Missing local Supabase QA configuration.');

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const email = suffix => `${suffix}@qa.bsmile.local`;
const qaProfiles = await admin.from('profiles').select('id,email').like('email', '%@qa.bsmile.local');
if (qaProfiles.error) throw qaProfiles.error;
const ids = Object.fromEntries(qaProfiles.data.map(profile => [profile.email, profile.id]));
const staffId = ids[email('staff')], gmId = ids[email('general-manager')], chairmanId = ids[email('chairman')];
if (!staffId || !gmId || !chairmanId) throw new Error('QA profiles are missing. Run npm run seed:qa-users first.');

const tasks = await admin.from('tasks').select('id,title').in('title', ['QA-GM-TREE-TASK', 'QA-GM-UNRELATED-TASK']);
if (tasks.error) throw tasks.error;
const taskId = Object.fromEntries(tasks.data.map(task => [task.title, task.id]));
const teamTask = taskId['QA-GM-TREE-TASK'], unrelatedTask = taskId['QA-GM-UNRELATED-TASK'];
if (!teamTask || !unrelatedTask) throw new Error('Required QA task fixtures are missing.');

// A prior negative test may have succeeded under an older policy. Remove only
// that disposable QA assignment before testing the policy reset.
const cleanup = await admin.from('task_assignments').delete().eq('task_id', unrelatedTask).eq('profile_id', gmId);
if (cleanup.error) throw cleanup.error;

async function asUser(userEmail) {
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email: userEmail, password });
  if (signedIn.error) throw new Error(`${userEmail}: ${signedIn.error.message}`);
  return client;
}
async function count(client, table, filter, label) {
  const query = filter(client.from(table).select('id', { count: 'exact', head: true }));
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message || JSON.stringify(result.error)}`);
  return result.count ?? 0;
}

const gm = await asUser(email('general-manager'));
const staff = await asUser(email('staff'));
const chairman = await asUser(email('chairman'));
console.log('QA authentication complete.');

console.log('Checking General Manager task and leave visibility.');
const result = {
  generalManager: {
    teamTaskVisible: await count(gm, 'tasks', query => query.eq('id', teamTask), 'GM team task'),
    unrelatedTaskVisible: await count(gm, 'tasks', query => query.eq('id', unrelatedTask), 'GM unrelated task'),
    teamLeaveVisible: await count(gm, 'leave_requests', query => query.eq('profile_id', staffId).eq('reason', 'QA-GM-TREE-LEAVE'), 'GM team leave'),
    unrelatedLeaveVisible: await count(gm, 'leave_requests', query => query.eq('id', '54ba0257-914d-49fc-8a4f-857014532d3a'), 'GM unrelated leave'),
  },
  staff: {
    assignedTaskVisible: await count(staff, 'tasks', query => query.eq('id', teamTask), 'Staff assigned task'),
    unrelatedTaskVisible: await count(staff, 'tasks', query => query.eq('id', unrelatedTask), 'Staff unrelated task'),
  },
  chairman: {
    teamTaskVisible: await count(chairman, 'tasks', query => query.eq('id', teamTask), 'Chairman team task'),
    unrelatedTaskVisible: await count(chairman, 'tasks', query => query.eq('id', unrelatedTask), 'Chairman unrelated task'),
  },
};

console.log('Checking General Manager task-assignment writes.');
const blocked = await gm.from('task_assignments').insert({ task_id: unrelatedTask, profile_id: gmId, status: 'todo' });
result.generalManager.unrelatedSelfAssignmentBlocked = Boolean(blocked.error);

const allowed = await gm.from('task_assignments').insert({ task_id: teamTask, profile_id: gmId, status: 'todo' }).select('id').maybeSingle();
result.generalManager.teamAssignmentAllowed = !allowed.error && Boolean(allowed.data?.id);
if (allowed.data?.id) {
  const removed = await gm.from('task_assignments').delete().eq('id', allowed.data.id);
  if (removed.error) throw removed.error;
}

const checks = [
  result.generalManager.teamTaskVisible === 1,
  result.generalManager.unrelatedTaskVisible === 0,
  result.generalManager.teamLeaveVisible === 1,
  result.generalManager.unrelatedLeaveVisible === 0,
  result.generalManager.unrelatedSelfAssignmentBlocked,
  result.generalManager.teamAssignmentAllowed,
  result.staff.assignedTaskVisible === 1,
  result.staff.unrelatedTaskVisible === 0,
  result.chairman.teamTaskVisible === 1,
  result.chairman.unrelatedTaskVisible === 1,
];
console.log(JSON.stringify({ passed: checks.every(Boolean), result }, null, 2));
if (!checks.every(Boolean)) process.exitCode = 1;
