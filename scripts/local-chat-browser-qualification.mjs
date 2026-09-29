import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const baseURL = process.env.BSMILE_QA_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.BSMILE_LOCAL_QA_PASSWORD;
const evidenceDir = process.env.BSMILE_LOCAL_QA_EVIDENCE_DIR;

for (const [name, value] of Object.entries({ baseURL, supabaseUrl, anonKey, serviceKey, password, evidenceDir })) {
  if (!value) throw new Error(`Missing ${name} for local chat browser qualification.`);
}
const app = new URL(baseURL);
const api = new URL(supabaseUrl);
if (!['127.0.0.1', 'localhost'].includes(app.hostname) || app.port !== '3010') throw new Error('Refusing to test a non-local app.');
if (!['127.0.0.1', 'localhost'].includes(api.hostname) || api.port !== '54321') throw new Error('Refusing to use a non-local Supabase API.');

const root = resolve(import.meta.dirname, '..');
const run = crypto.randomUUID().slice(0, 8);
const marker = `CHAT-BROWSER-${run}`;
const screenshotsDir = join(evidenceDir, 'screenshots');
const userIds = [];
const conversationIds = [];
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort().map((name) => ({
  name,
  sha256: sha256(readFileSync(join(root, 'supabase/migrations', name))),
}));
const report = {
  run,
  marker,
  projectId: 'bsmile-canonical-baseline-empty-20260925',
  schemaVariant: 'canonical-column-absent-with-local-only-push-mock',
  sourceCommit: git('rev-parse', 'HEAD'),
  workingTreeStatus: git('status', '--short') || 'clean',
  command: 'node scripts/local-chat-browser-qualification.mjs',
  startedAt: new Date().toISOString(),
  migrations,
  checks: [],
  screenshots: [],
};

function pass(name, detail) {
  report.checks.push({ name, status: 'PASS', ...(detail ? { detail } : {}) });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function expectNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || ''} ${result.error.message}`.trim());
  return result.data;
}

async function createUser(key, role = 'staff') {
  const email = `${marker.toLowerCase()}-${key}@example.test`;
  const created = expectNoError(await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { local_chat_browser_qa_run: run },
    user_metadata: { synthetic: true },
  }), `create ${key} Auth user`).user;
  userIds.push(created.id);
  const department = expectNoError(await service.from('departments').select('id').eq('is_active', true).limit(1).single(), 'read department');
  expectNoError(await service.from('profiles').insert({
    id: created.id,
    full_name: `${marker} ${key}`,
    email,
    work_email: `${marker.toLowerCase()}-${key}-work@example.test`,
    role,
    status: 'active',
    is_employee: true,
    workforce_visible: true,
    login_enabled: true,
    employee_code: `${run.toUpperCase()}-${key.toUpperCase()}`,
    designation: `QA ${key}`,
    department_id: department.id,
    onboarding_required: false,
  }), `create ${key} profile`);
  return { id: created.id, email, name: `${marker} ${key}` };
}

async function login(page, account, route) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(?:admin|employee)(?:\/|$)/, { timeout: 120_000 });
  await page.goto(route);
  await page.locator('.chat-hub').waitFor({ timeout: 120_000 });
}

async function shot(page, name) {
  mkdirSync(screenshotsDir, { recursive: true });
  const path = join(screenshotsDir, name);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(path);
}

async function choosePerson(page, person) {
  await page.getByPlaceholder('Search active employees').fill(person.name);
  const option = page.getByRole('option').filter({ hasText: person.name });
  await option.waitFor();
  await option.click();
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

const browser = await chromium.launch({ headless: true });
try {
  const gm = await createUser('gm', 'general_manager');
  const employeeA = await createUser('employee-a');
  const employeeB = await createUser('employee-b');

  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  await login(page, gm, '/admin/chat');

  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('button', { name: /Direct message/ }).click();
  await choosePerson(page, employeeA);
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.getByRole('heading', { name: employeeA.name }).waitFor();
  const direct = expectNoError(await service.from('chat_conversations').select('id,chat_members!inner(profile_id)').eq('conversation_type', 'personal').in('chat_members.profile_id', [gm.id, employeeA.id]), 'read browser direct conversation');
  assert.equal(direct.length, 1);
  conversationIds.push(direct[0].id);
  pass('browser creates a brand-new direct conversation');

  const directBody = `${marker} direct browser message`;
  await page.getByPlaceholder('Type a message...').fill(directBody);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.locator('.chat-messages').getByText(directBody).waitFor();
  await shot(page, 'chat-correction-direct-created.png');
  pass('browser sends and renders a direct message');

  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('button', { name: /Direct message/ }).click();
  await choosePerson(page, employeeA);
  await page.getByRole('button', { name: 'Start conversation' }).click();
  const reused = expectNoError(await service.from('chat_conversations').select('id,chat_members!inner(profile_id)').eq('conversation_type', 'personal').in('chat_members.profile_id', [gm.id, employeeA.id]), 'verify browser direct reuse');
  assert.equal(reused.length, 1);
  assert.equal(reused[0].id, direct[0].id);
  pass('browser reopens the existing direct conversation without duplication');

  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('button', { name: /New group/ }).click();
  const groupName = `${marker} Project Group`;
  await page.getByLabel('Group name').fill(groupName);
  await choosePerson(page, employeeA);
  await page.getByPlaceholder('Search active employees').fill(employeeB.name);
  await choosePerson(page, employeeB);
  await page.getByRole('dialog').getByRole('button', { name: 'Create group', exact: true }).click();
  await page.getByRole('heading', { name: groupName }).waitFor();
  const group = expectNoError(await service.from('chat_conversations').select('id,created_by,group_admin_id').eq('title', groupName).single(), 'read browser group conversation');
  conversationIds.push(group.id);
  assert.equal(group.created_by, gm.id);
  assert.equal(group.group_admin_id, gm.id);
  const members = expectNoError(await service.from('chat_members').select('profile_id').eq('conversation_id', group.id), 'read browser group membership');
  assert.deepEqual(new Set(members.map((row) => row.profile_id)), new Set([gm.id, employeeA.id, employeeB.id]));
  pass('browser creates a group with the creator and selected members');

  const groupBody = `${marker} group browser message`;
  await page.getByPlaceholder('Type a message...').fill(groupBody);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.locator('.chat-messages').getByText(groupBody).waitFor();
  await shot(page, 'chat-correction-group-created.png');
  pass('browser sends and renders a group message');
  const persistedGroupMessage = expectNoError(await service.from('chat_messages').select('id').eq('conversation_id', group.id).eq('body', groupBody).single(), 'verify persisted browser group message');
  const memberApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expectNoError(await memberApi.auth.signInWithPassword({ email: employeeA.email, password }), 'sign in group member API');
  const memberVisibleMessage = expectNoError(await memberApi.from('chat_messages').select('id,conversation_id,body').eq('id', persistedGroupMessage.id).single(), 'read group message as member API');
  assert.equal(memberVisibleMessage.body, groupBody);
  pass('authorized member reads the new group message through the intended API');
  const memberRepositoryPage = expectNoError(await memberApi.from('chat_messages').select('id,conversation_id,sender_id,body,message_type,attachment_path,attachment_name,attachment_type,attachment_size,voice_duration_seconds,client_message_id,created_at,reply_to_message_id,edited_at,deleted_at,deleted_by,expires_at,expired_at,sender:profiles!chat_messages_sender_id_fkey(full_name,avatar_url),reactions:chat_message_reactions(profile_id,emoji),mentions:chat_message_mentions(profile_id,profiles(full_name,avatar_url)),receipts:chat_message_reads(profile_id,delivered_at,read_at)').eq('conversation_id', group.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50), 'read group message through repository query');
  assert.equal(memberRepositoryPage.length, 1);
  pass('authorized member repository query retains the new group message');
  await context.close();

  const memberContext = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } });
  const memberPage = await memberContext.newPage();
  memberPage.setDefaultTimeout(90_000);
  await login(memberPage, employeeA, '/employee/chat');
  const groupRow = memberPage.locator('.chat-conversation').filter({ hasText: groupName });
  await groupRow.waitFor();
  await groupRow.click();
  await memberPage.getByRole('heading', { name: groupName }).waitFor();
  try {
    await memberPage.locator('.chat-messages').getByText(groupBody).waitFor({ timeout: 20_000 });
  } catch (error) {
    const diagnostics = {
      banner: await memberPage.locator('.employee-banner').allTextContents(),
      messages: await memberPage.locator('.chat-messages').allTextContents(),
    };
    console.error(`MEMBER_DIAGNOSTICS ${JSON.stringify(diagnostics)}`);
    await shot(memberPage, 'chat-correction-member-read-failure.png');
    throw error;
  }
  await shot(memberPage, 'chat-correction-member-read.png');
  await memberContext.close();
  pass('authorized member reads the newly created group in the browser');

  report.finishedAt = new Date().toISOString();
  report.result = 'PASS';
  writeFileSync(join(evidenceDir, 'chat-browser-c9e42a1-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`RESULT ${report.checks.length} browser checks passed`);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.result = 'FAIL';
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(join(evidenceDir, 'chat-browser-c9e42a1-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`FAIL ${report.failure}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await cleanup();
}
