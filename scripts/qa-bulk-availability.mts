// Disposable fixtures only. This harness cannot connect to production.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import * as availabilityEntry from '../src/lib/weekly-availability-entry';
const parseAvailabilityText = (availabilityEntry as any).parseAvailabilityText || (availabilityEntry as any).default?.parseAvailabilityText;

process.loadEnvFile(process.env.BSMILE_QA_ENV_FILE || '../../.env.release-gate.local');
const url = process.env.BSMILE_QA_SUPABASE_URL!;
const project = 'enylrvmjgbntkrgpqsfe';
if (new URL(url).hostname !== project + '.supabase.co' || process.env.BSMILE_QA_PROJECT_REF !== project) throw Error('Approved isolated QA project required.');
const directory = 'release-evidence/bulk-availability';
mkdirSync(directory, { recursive: true });
const fixturePath = directory + '/fixtures.local.json';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!, options);
const checked = (result: any) => { if (result.error) throw Error(result.error.message); return result.data; };
const f: any = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : { run: randomUUID(), password: randomUUID() + randomUUID(), users: {}, doctor: null };
const persist = () => writeFileSync(fixturePath, JSON.stringify(f, null, 2));
const doctorName = 'QA Bulk Availability ' + f.run;
async function login(actor: string) {
  const client = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, options);
  checked(await client.auth.signInWithPassword({ email: f.users[actor].email, password: f.password }));
  return client;
}
async function verifyFixtures() {
  for (const user of Object.values(f.users) as any[]) {
    const identity = checked(await service.auth.admin.getUserById(user.id)).user;
    assert.equal(identity.email, user.email); assert.equal(identity.app_metadata.qa_bulk_availability_run, f.run);
  }
  if (f.doctor) {
    const row = checked(await service.from('outsourced_doctors').select('id,doctor_name,profile_id').eq('id', f.doctor).single());
    assert.equal(row.doctor_name, doctorName); assert.equal(row.profile_id, f.users.external.id);
  }
}
async function prepare() {
  await verifyFixtures();
  for (const [actor, role, employee] of [
    ['aiswarya', 'psychologist', true], ['faiz', 'general_manager', true], ['diya', 'staff', true],
    ['normal', 'staff', true], ['broad', 'director', true], ['external', 'staff', false],
  ] as const) {
    if (!f.users[actor]) {
      const email = 'qa-bulk-' + f.run + '-' + actor + '@example.test';
      const created = checked(await service.auth.admin.createUser({ email, password: f.password, email_confirm: true, app_metadata: { qa_bulk_availability_run: f.run } }));
      f.users[actor] = { id: created.user.id, email }; persist();
    }
    checked(await service.from('profiles').upsert({
      id: f.users[actor].id, email: f.users[actor].email, full_name: 'QA Bulk ' + actor + ' ' + f.run,
      role, is_employee: employee, workforce_visible: employee, status: 'active', login_enabled: true,
      onboarding_required: false, employee_code: null,
    }));
    const codes = ['aiswarya', 'faiz', 'diya'].includes(actor) ? ['outsourced_clinicians.manage']
      : actor === 'broad' ? ['doctor_scheduling.manage_doctors', 'clinician.availability.manage_all'] : actor === 'external' ? ['clinician.workspace', 'clinician.profile.edit'] : [];
    if (codes.length) {
      const permissions = checked(await service.from('permissions').select('id,code').in('code', codes));
      assert.equal(permissions.length, codes.length);
      for (const permission of permissions) {
        const grants = checked(await service.from('user_permission_grants').select('id').eq('profile_id', f.users[actor].id).eq('permission_id', permission.id).is('revoked_at', null));
        if (!grants.length) checked(await service.from('user_permission_grants').insert({
          profile_id: f.users[actor].id, permission_id: permission.id, granted_by: f.users.aiswarya.id,
          reason: 'Disposable bulk availability QA ' + f.run, expires_at: new Date(Date.now() + 86400000).toISOString(),
        }));
      }
    }
  }
  if (!f.doctor) {
    const row = checked(await service.from('outsourced_doctors').insert({
      doctor_name: doctorName, profile_id: f.users.external.id, consultation_duration_minutes: 30,
      qualification: 'QA fixture', specialization: 'QA fixture', phone: '0000000000',
      clinician_type: 'outsourced', self_service_enabled: true, status: 'active', created_by: f.users.aiswarya.id,
    }).select('id').single());
    f.doctor = row.id; persist();
  }
  await verifyFixtures();
  console.log('Prepared six disposable QA identities and one QA clinician. Credentials stay in ignored evidence.');
}
async function probe() {
  await verifyFixtures(); assert.ok(f.doctor);
  const results: any[] = [];
  async function run(name: string, action: () => Promise<void>) {
    try { await action(); results.push({ name, status: 'PASS' }); }
    catch (error: any) { results.push({ name, status: 'FAIL', error: error.message }); }
    writeFileSync(directory + '/live-rpc-results.json', JSON.stringify({ project, productionTouched: false, results }, null, 2));
  }
  const parsed = parseAvailabilityText('Mon-Sat: 9-10 AM, 2-3 PM, 6-7 PM\nSun: 10 AM-1 PM', 30);
  assert.equal(parsed.error, null);
  for (const actor of ['aiswarya', 'faiz', 'diya']) {
    const client = await login(actor);
    await run(actor + ' scoped manager saves nineteen canonical rows', async () => {
      assert.equal(checked(await client.rpc('has_permission', { permission_code: 'outsourced_clinicians.manage' })), true);
      assert.equal(checked(await client.from('outsourced_doctors').select('consultation_duration_minutes').eq('id', f.doctor).single()).consultation_duration_minutes, 30);
      const saved = checked(await client.rpc('replace_clinician_availability', { target_doctor: f.doctor, ranges: parsed.ranges }));
      assert.deepEqual(saved.map((row: any) => ({ day_of_week: row.day_of_week, start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5) })), parsed.ranges);
    });
    await client.auth.signOut();
  }
  for (const actor of ['external', 'normal', 'broad']) {
    const client = await login(actor);
    await run(actor + ' cannot save outsourced availability', async () => {
      assert.equal(checked(await client.rpc('has_permission', { permission_code: 'outsourced_clinicians.manage' })), false);
      const before = checked(await service.from('doctor_weekly_availability').select('*').eq('doctor_id', f.doctor));
      const result = await client.rpc('replace_clinician_availability', { target_doctor: f.doctor, ranges: [] });
      assert.equal(result.error?.code, '42501');
      const after = checked(await service.from('doctor_weekly_availability').select('*').eq('doctor_id', f.doctor));
      assert.deepEqual(after, before);
    });
    if (actor === 'external') await run('external psychologist views own canonical availability', async () => {
      const schedule = checked(await client.rpc('clinician_schedule'));
      assert.equal(schedule.doctor_id, f.doctor); assert.equal(schedule.availability.length, 19);
    });
    await client.auth.signOut();
  }
  const client = await login('faiz');
  await run('live overnight RPC preserves range and rejects cross-day overlap atomically', async () => {
    const overnight = parseAvailabilityText('Monday-Saturday: 1:30 PM-1 AM', 30);
    assert.equal(overnight.error, null);
    const saved = checked(await client.rpc('replace_clinician_availability', { target_doctor: f.doctor, ranges: overnight.ranges }));
    assert.equal(saved.length, 6); assert.equal(saved[0].end_time, '01:00:00');
    const denied = await client.rpc('replace_clinician_availability', { target_doctor: f.doctor, ranges: [...overnight.ranges, { day_of_week: 2, start_time: '00:00', end_time: '02:00' }] });
    assert.ok(denied.error);
    assert.equal(checked(await service.from('doctor_weekly_availability').select('id').eq('doctor_id', f.doctor)).length, 6);
    checked(await client.rpc('replace_clinician_availability', { target_doctor: f.doctor, ranges: parsed.ranges }));
  });
  await client.auth.signOut();
  console.log(JSON.stringify(results));
  if (results.some(row => row.status !== 'PASS')) process.exitCode = 1;
}
async function cleanup() {
  await verifyFixtures();
  const ids = Object.values(f.users).map((user: any) => user.id);
  assert.equal(ids.length, 6);
  const timestamp = new Date().toISOString();
  checked(await service.from('user_permission_grants').update({ revoked_at: timestamp }).in('profile_id', ids).is('revoked_at', null));
  checked(await service.from('profiles').update({ login_enabled: false }).in('id', ids));
  checked(await service.from('outsourced_doctors').update({ self_service_enabled: false }).eq('id', f.doctor));
  for (const id of ids) checked(await service.auth.admin.updateUserById(id, { ban_duration: '876000h' }));
  writeFileSync(directory + '/cleanup.json', JSON.stringify({ project, disabledQaUsers: ids.length, disabledQaClinicians: 1, productionTouched: false, completedAt: timestamp }, null, 2));
  console.log('Disabled only task-owned QA fixtures; no patients or appointments created or changed.');
}
if (process.argv.includes('--prepare')) await prepare();
else if (process.argv.includes('--probe')) await probe();
else if (process.argv.includes('--cleanup')) await cleanup();
else if (process.argv.includes('--serve')) {
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.BSMILE_QA_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL: 'http://localhost:3035', NODE_ENV: 'development' });
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', '3035'], { env: process.env, stdio: 'inherit', windowsHide: true });
  child.on('exit', code => process.exit(code || 0));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
} else throw Error('Use --prepare, --probe, --cleanup or --serve.');
