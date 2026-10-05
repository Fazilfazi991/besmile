import { spawn } from 'node:child_process';
process.loadEnvFile('../.env.release-gate.local');
if (new URL(process.env.BSMILE_QA_SUPABASE_URL).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('Approved QA project required.');
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.BSMILE_QA_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.BSMILE_QA_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3033', NODE_ENV: 'development',
});
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', '3033'], { env: process.env, stdio: 'inherit', windowsHide: true });
child.on('exit', code => process.exit(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
