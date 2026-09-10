import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { isTransientAuthorizationError } from '../src/lib/authorization-transport';

const expected = 'enylrvmjgbntkrgpqsfe';
const results: {name: string; status: string}[] = [];
let infrastructure = false;
async function check(name: string, operation: () => Promise<void>) {
  try { await operation(); results.push({name, status:'PASS'}); }
  catch (error) {
    const transient = isTransientAuthorizationError(error);
    infrastructure ||= transient;
    results.push({name, status:transient ? 'INFRASTRUCTURE BLOCKED' : 'FAIL'});
  }
}
async function main() {
  const url = process.env.BSMILE_QA_SUPABASE_URL || '';
  const safe = process.env.BSMILE_QA_PROJECT_REF === expected && new URL(url).hostname === `${expected}.supabase.co`;
  if (!safe) throw new Error('QA project identity mismatch');
  results.push({name:'QA project identity',status:'PASS'});
  for (const role of ['ADMIN','GENERAL_MANAGER','MANAGER','EMPLOYEE']) {
    const db = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, {
      auth: {persistSession:false,autoRefreshToken:false},
      global: {fetch: (input, init) => fetch(input, {...init, signal:AbortSignal.timeout(5000)})},
    });
    await check(`${role} auth/profile/permission connectivity`, async () => {
      const auth = await db.auth.signInWithPassword({email:process.env[`BSMILE_QA_${role}_EMAIL`]!,password:process.env[`BSMILE_QA_${role}_PASSWORD`]!});
      if (auth.error) throw auth.error;
      const profile = await db.from('profiles').select('id').eq('id',auth.data.user.id).single();
      if (profile.error) throw profile.error;
      const permission = await db.rpc('has_permission',{permission_code:'attendance.self'});
      if (permission.error) throw permission.error;
      if (typeof permission.data !== 'boolean') throw new Error('Invalid permission response');
    });
    if (results.some(result => result.status !== 'PASS')) break;
  }
}
main().catch(() => { results.push({name:'QA configuration',status:'FAIL'}); }).finally(() => {
  const verdict = infrastructure ? 'RELEASE GATE INFRASTRUCTURE BLOCKED' : results.every(result => result.status === 'PASS') ? 'PASS' : 'FAIL';
  writeFileSync('release-evidence/qa-preflight.json',JSON.stringify({qaProjectRef:expected,results,verdict},null,2));
  console.log(`QA preflight: ${verdict}`);
  process.exitCode = infrastructure ? 2 : verdict === 'PASS' ? 0 : 1;
});
