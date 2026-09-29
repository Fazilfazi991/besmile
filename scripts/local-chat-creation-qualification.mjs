import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.BSMILE_LOCAL_QA_PASSWORD;
const evidenceDir = process.env.BSMILE_LOCAL_QA_EVIDENCE_DIR;
const evidenceName = process.env.BSMILE_CHAT_QA_REPORT || 'chat-creation-qualification-report.json';

if (process.env.BSMILE_LOCAL_QA_ACK !== 'LOCAL_DOCKER_ONLY') throw new Error('Local QA acknowledgement is required.');
const parsedUrl = new URL(url || '');
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) || parsedUrl.port !== '54321') {
  throw new Error('Refusing to run outside the verified local Supabase API on port 54321.');
}
if (!anonKey || !serviceKey || !password || !evidenceDir) throw new Error('Local QA environment is incomplete.');

const root = resolve(import.meta.dirname, '..');
const command = 'node scripts/local-chat-creation-qualification.mjs';
const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const service = createClient(url, serviceKey, { auth: authOptions });
const anon = createClient(url, anonKey, { auth: authOptions });
const run = crypto.randomUUID().slice(0, 8);
const marker = `CHAT-QA-${run}`;
const userIds = [];
const conversationIds = [];

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
const migrations = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sha256: sha256(readFileSync(resolve(root, 'supabase/migrations', name))) }));
const dockerServices = execFileSync('docker', ['ps', '--filter', 'name=bsmile-canonical-baseline-empty-20260925', '--format', '{{.Names}}|{{.Image}}'], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, image] = line.split('|');
    return { name, image };
  });
const databaseVersion = execFileSync('docker', ['exec', 'supabase_db_bsmile-canonical-baseline-empty-20260925', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-Atc', 'show server_version'], { encoding: 'utf8' }).trim();
const report = {
  run,
  marker,
  schemaVariant: 'canonical-column-absent',
  projectId: 'bsmile-canonical-baseline-empty-20260925',
  sourceCommit: git('rev-parse', 'HEAD'),
  workingTreeStatus: git('status', '--short') || 'clean',
  command,
  startedAt: new Date().toISOString(),
  databaseVersion,
  serviceVersions: dockerServices,
  migrations,
  checks: [],
};

function record(name, status, detail) {
  report.checks.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}

function expectNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || ''} ${result.error.message}`.trim());
  return result.data;
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, 'PASS', detail);
  } catch (error) {
    record(name, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

async function createAuthProfile(key, overrides = {}) {
  const email = `${marker.toLowerCase()}-${key}@example.test`;
  const created = expectNoError(await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { local_chat_qa_run: run },
    user_metadata: { synthetic: true },
  }), `create ${key} Auth user`).user;
  userIds.push(created.id);
  const profile = {
    id: created.id,
    full_name: `${marker} ${key}`,
    email,
    work_email: `${marker.toLowerCase()}-${key}-work@example.test`,
    role: 'staff',
    status: 'active',
    is_employee: true,
    workforce_visible: true,
    login_enabled: true,
    employee_code: `${run.toUpperCase()}-${key.toUpperCase()}`,
    onboarding_required: false,
    ...overrides,
  };
  expectNoError(await service.from('profiles').insert(profile), `create ${key} profile`);
  const client = createClient(url, anonKey, { auth: authOptions });
  const signedIn = expectNoError(await client.auth.signInWithPassword({ email, password }), `sign in ${key}`);
  assert.equal(signedIn.user.id, created.id);
  return { id: created.id, client };
}

async function rpc(client, name, args, label) {
  return expectNoError(await client.rpc(name, args), label);
}

async function count(table, apply = (query) => query) {
  const result = await apply(service.from(table).select('id', { count: 'exact', head: true }));
  expectNoError(result, `count ${table}`);
  return result.count;
}

async function cleanup() {
  if (conversationIds.length) {
    await service.from('chat_messages').delete().in('conversation_id', conversationIds);
    await service.from('chat_members').delete().in('conversation_id', conversationIds);
    await service.from('chat_conversations').delete().in('id', conversationIds);
  }
  if (userIds.length) await service.from('profiles').delete().in('id', userIds);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
}

try {
  const before = {
    conversations: await count('chat_conversations'),
    messages: await count('chat_messages'),
  };
  const preservedMessages = expectNoError(await service.from('chat_messages').select('id').order('created_at').limit(20), 'snapshot existing messages').map((row) => row.id);

  const gm = await createAuthProfile('gm', { role: 'general_manager', designation: 'QA General Manager' });
  const employeeA = await createAuthProfile('employee-a', { designation: 'QA Employee A', manager_id: gm.id });
  const employeeB = await createAuthProfile('employee-b', { designation: 'QA Employee B', manager_id: gm.id });
  const employeeC = await createAuthProfile('employee-c', { designation: 'QA Employee C', manager_id: gm.id });
  const unauthorized = await createAuthProfile('unauthorized', { role: 'guest_sales', designation: 'QA Unauthorized' });
  const inactive = await createAuthProfile('inactive', { status: 'inactive', designation: 'QA Inactive' });

  let directId;
  await check('create a brand-new direct conversation through authenticated RPC', async () => {
    directId = await rpc(gm.client, 'create_or_get_direct_chat', { other_profile: employeeA.id }, 'create direct conversation');
    conversationIds.push(directId);
    return directId;
  });
  await check('reuse the existing direct conversation from the other participant', async () => {
    const reused = await rpc(employeeA.client, 'create_or_get_direct_chat', { other_profile: gm.id }, 'reuse direct conversation');
    assert.equal(reused, directId);
    return reused;
  });

  let concurrentId;
  await check('concurrent direct-chat requests create one conversation', async () => {
    const calls = await Promise.all([
      employeeB.client.rpc('create_or_get_direct_chat', { other_profile: employeeC.id }),
      employeeB.client.rpc('create_or_get_direct_chat', { other_profile: employeeC.id }),
    ]);
    const ids = calls.map((result, index) => expectNoError(result, `concurrent direct request ${index + 1}`));
    assert.equal(new Set(ids).size, 1);
    concurrentId = ids[0];
    conversationIds.push(concurrentId);
    const matching = expectNoError(await service.from('chat_conversations').select('id,chat_members!inner(profile_id)').eq('conversation_type', 'personal').in('chat_members.profile_id', [employeeB.id, employeeC.id]), 'read direct candidates');
    const exact = [];
    for (const candidate of matching) {
      const members = expectNoError(await service.from('chat_members').select('profile_id').eq('conversation_id', candidate.id), 'read direct members');
      if (members.length === 2 && members.some((row) => row.profile_id === employeeB.id) && members.some((row) => row.profile_id === employeeC.id)) exact.push(candidate.id);
    }
    assert.deepEqual([...new Set(exact)], [concurrentId]);
    return concurrentId;
  });

  let groupId;
  await check('create a brand-new authorized group with creator membership', async () => {
    groupId = await rpc(gm.client, 'create_group_chat', {
      chat_title: `${marker} Group`,
      chat_description: 'Synthetic local chat qualification',
      chat_type: 'project',
      member_ids: [employeeA.id, employeeB.id],
    }, 'create group conversation');
    conversationIds.push(groupId);
    const group = expectNoError(await gm.client.from('chat_conversations').select('id,created_by,group_admin_id').eq('id', groupId).single(), 'read created group');
    assert.equal(group.created_by, gm.id);
    assert.equal(group.group_admin_id, gm.id);
    const members = expectNoError(await service.from('chat_members').select('profile_id').eq('conversation_id', groupId), 'read group members');
    assert.deepEqual(new Set(members.map((row) => row.profile_id)), new Set([gm.id, employeeA.id, employeeB.id]));
    return groupId;
  });

  await check('send and read messages in newly created conversations', async () => {
    for (const [conversationId, sender, reader, body] of [
      [directId, gm, employeeA, `${marker} direct message`],
      [groupId, employeeA, gm, `${marker} group message`],
    ]) {
      assert(conversationId, 'conversation creation prerequisite failed');
      const sent = expectNoError(await sender.client.from('chat_messages').insert({
        conversation_id: conversationId,
        sender_id: sender.id,
        body,
        message_type: 'text',
        client_message_id: crypto.randomUUID(),
      }).select('id,conversation_id,body').single(), 'send chat message');
      const read = expectNoError(await reader.client.from('chat_messages').select('id,body').eq('id', sent.id).single(), 'read chat message');
      assert.equal(read.body, body);
    }
  });

  await check('unauthorized callers and ineligible participants are rejected', async () => {
    for (const result of [
      await anon.rpc('create_or_get_direct_chat', { other_profile: gm.id }),
      await unauthorized.client.rpc('create_or_get_direct_chat', { other_profile: gm.id }),
      await gm.client.rpc('create_or_get_direct_chat', { other_profile: inactive.id }),
      await gm.client.rpc('create_group_chat', { chat_title: `${marker} denied`, chat_description: '', chat_type: 'project', member_ids: [employeeA.id, inactive.id] }),
    ]) assert(result.error, 'expected chat creation to be denied');
  });

  await check('existing Teams conversations and message history survive', async () => {
    const stillPresent = preservedMessages.length
      ? expectNoError(await service.from('chat_messages').select('id').in('id', preservedMessages), 'verify existing messages')
      : [];
    assert.equal(stillPresent.length, preservedMessages.length);
    assert((await count('chat_conversations')) >= before.conversations);
    assert((await count('chat_messages')) >= before.messages);
    return `${before.conversations} pre-existing conversations; ${preservedMessages.length} sampled messages retained`;
  });
} catch (error) {
  report.setupFailure = error instanceof Error ? error.message : String(error);
  console.error(`SETUP FAIL ${report.setupFailure}`);
} finally {
  await cleanup();
  report.finishedAt = new Date().toISOString();
  report.result = !report.setupFailure && report.checks.length === 7 && report.checks.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL';
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(resolve(evidenceDir, evidenceName), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`RESULT ${report.result}: ${report.checks.filter((item) => item.status === 'PASS').length}/${report.checks.length} checks passed`);
  if (report.result !== 'PASS') process.exitCode = 1;
}
