import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const output = 'release-evidence';
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/fixture-login-retries.jsonl`, '');
if (existsSync('.env.release-gate.local')) process.loadEnvFile('.env.release-gate.local');

const releaseConfig = JSON.parse(readFileSync('release-gate.config.json', 'utf8'));
const approvedDeployAuthorEmails = releaseConfig.approvedDeployAuthorEmails
  .map(email => email.trim().toLowerCase());
const gitAuthorEmail = spawnSync('git', ['log', '-1', '--format=%ae'], { encoding: 'utf8' })
  .stdout.trim().toLowerCase();
const authorizedCommitAuthor = approvedDeployAuthorEmails.includes(gitAuthorEmail);

const requiredEnvironment = [
  'BSMILE_QA_BASE_URL', 'BSMILE_QA_SUPABASE_URL', 'BSMILE_QA_SUPABASE_ANON_KEY', 'BSMILE_QA_PROJECT_REF',
  'BSMILE_QA_ADMIN_EMAIL', 'BSMILE_QA_ADMIN_PASSWORD',
  'BSMILE_QA_GENERAL_MANAGER_EMAIL', 'BSMILE_QA_GENERAL_MANAGER_PASSWORD',
  'BSMILE_QA_MANAGER_EMAIL', 'BSMILE_QA_MANAGER_PASSWORD',
  'BSMILE_QA_EMPLOYEE_EMAIL', 'BSMILE_QA_EMPLOYEE_PASSWORD',
];
const missingEnvironment = requiredEnvironment.filter(name => !process.env[name]);
const productionRef = 'ksmqzxncdvuxiabypjth';
const qaRef = process.env.BSMILE_QA_PROJECT_REF;
const qaUrlRef = process.env.BSMILE_QA_SUPABASE_URL ? new URL(process.env.BSMILE_QA_SUPABASE_URL).hostname.split('.')[0] : null;
const unsafeQaEnvironment = !missingEnvironment.length && (qaRef === productionRef || qaUrlRef !== qaRef);

if (!missingEnvironment.length && !unsafeQaEnvironment) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.BSMILE_QA_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.BSMILE_QA_SUPABASE_ANON_KEY;
}

const steps = [
  ['clean install', 'npm', ['ci']],
  ['TypeScript', 'npm', ['run', 'typecheck']],
  ['ESLint', 'npm', ['run', 'lint']],
  ['tests', 'npm', ['test', '--', '--reporter=json', '--outputFile=release-evidence/vitest-results.json']],
  ['production build', 'npm', ['run', 'build']],
  ['QA connectivity/auth preflight', 'node', ['--import', 'tsx', 'scripts/qa-auth-preflight.ts']],
  ['QA database/RLS probes', 'node', ['scripts/qa-security-probes.mjs']],
];
const results = [{
  name: 'commit author authorization',
  status: authorizedCommitAuthor ? 'PASS' : 'FAIL',
  authorEmail: gitAuthorEmail || 'MISSING',
}];
function runStep([name, command, args]) {
  const run = spawnSync(command, args, { shell: process.platform === 'win32', stdio: 'inherit', env: process.env });
  const status = run.status === 0 ? 'PASS' : name === 'QA connectivity/auth preflight' && run.status === 2 ? 'INFRASTRUCTURE BLOCKED' : 'FAIL';
  results.push({ name, status });
  return status === 'PASS';
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url, { redirect: 'manual' })).status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`QA application did not become ready at ${url}`);
}

let appServer;
try {
  if (!authorizedCommitAuthor) {
    console.error('RELEASE GATE FAIL — UNAUTHORIZED COMMIT AUTHOR');
  } else if (missingEnvironment.length) {
    results.push({ name: 'QA configuration', status: 'FAIL', missing: missingEnvironment });
  } else if (unsafeQaEnvironment) {
    results.push({ name: 'QA configuration', status: 'FAIL', reason: 'QA project identity mismatch or Production project supplied' });
  } else {
    for (const step of steps) if (!runStep(step)) break;
    if (results.length === steps.length + 1 && results.every(result => result.status === 'PASS')) {
      const baseUrl = new URL(process.env.BSMILE_QA_BASE_URL);
      const localQa = ['127.0.0.1', 'localhost'].includes(baseUrl.hostname);
      if (localQa) {
        const port = baseUrl.port || (baseUrl.protocol === 'https:' ? '443' : '80');
        appServer = spawn('npm', ['start', '--', '-p', port], { shell: process.platform === 'win32', detached: process.platform === 'win32', windowsHide: true, stdio: 'inherit', env: process.env });
        await waitForServer(process.env.BSMILE_QA_BASE_URL);
      }
      runStep(['critical browser flows', 'npx', ['playwright', 'test', 'tests/e2e/critical-flows.e2e.ts', 'tests/e2e/appointments-kpi.e2e.ts', 'tests/e2e/mobile-profile-polish.e2e.ts']]);
    }
  }
} finally {
  if (appServer?.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(appServer.pid), '/t', '/f'], { stdio: 'ignore' });
    else appServer.kill('SIGTERM');
  }
}

const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const ran = name => results.some(result => result.name === name);
const e2e = ran('critical browser flows') ? readJson(`${output}/playwright-results.json`)?.stats || null : null;
const unit = ran('tests') ? readJson(`${output}/vitest-results.json`) : null;
const security = ran('QA database/RLS probes') ? readJson(`${output}/security-results.json`) : null;
const expectedSteps = steps.length + 2;
const verdict = !authorizedCommitAuthor
  ? 'RELEASE GATE FAIL — UNAUTHORIZED COMMIT AUTHOR'
  : results.some(result => result.status === 'INFRASTRUCTURE BLOCKED') ? 'RELEASE GATE INFRASTRUCTURE BLOCKED'
  : results.length === expectedSteps && results.every(result => result.status === 'PASS') && e2e && e2e.unexpected === 0 && e2e.skipped === 0 && e2e.flaky === 0
    ? 'RELEASE GATE PASS'
    : 'RELEASE GATE FAIL';
const report = {
  generatedAt: new Date().toISOString(), gitSha: sha, qaProjectRef: qaRef || 'MISSING', requiredViewports: ['390x844', '1366x768'], steps: results,
  unitTests: unit ? { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests } : null,
  e2e, security: security ? { total: security.total, passed: security.passed, failed: security.failed } : null, verdict,
  fixtureLoginRetries: readFileSync(`${output}/fixture-login-retries.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
};
writeFileSync(`${output}/release-gate-report.json`, JSON.stringify(report, null, 2));
console.log(`\n${verdict}\nEvidence: ${output}/release-gate-report.json`);
if (verdict !== 'RELEASE GATE PASS') process.exitCode = 1;
