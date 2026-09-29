import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const action = readFileSync(new URL('../app/admin/employees/new/actions.ts', import.meta.url), 'utf8');
const form = readFileSync(new URL('../app/admin/employees/new/form.tsx', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../app/onboarding/password/actions.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260929035301_release_2_workflows_and_client_sessions.sql', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

describe('employee login email and secure initial credential', () => {
  it('keeps work and login emails independent after the initial default', () => {
    expect(form).toContain('name="work_email"');
    expect(form).toContain('name="login_email"');
    expect(form).toContain('loginEmailEdited');
    expect(action).toContain('email: loginEmail, work_email: workEmail');
  });

  it('uses a server-only configured credential and never commits the requested secret', () => {
    expect(action).toContain('process.env.EMPLOYEE_INITIAL_PASSWORD');
    expect(envExample).toContain('EMPLOYEE_INITIAL_PASSWORD=');
    expect(action + form + migration + envExample).not.toContain('Bsmile@1234');
  });

  it('reconciles only the same provisioning request and never takes over an existing account', () => {
    expect(action).toContain('employee_provision_request_id === requestId');
    expect(action).not.toContain('match.user_metadata?.employee_provision_request_id');
    expect(action).toContain('That login email already belongs to another account.');
    expect(action).not.toContain('resetPasswordForEmail');
  });

  it('enforces verified-email password change before normal application access', () => {
    expect(middleware).toContain('if (profile.onboarding_required)');
    expect(middleware).toContain("if (path === '/onboarding/password') return response");
    expect(migration).toContain('and not coalesce(subject.onboarding_required, false)');
    expect(onboarding).toContain('user.email_confirmed_at');
    expect(onboarding).toContain("rpc('complete_employee_onboarding', { target_profile: user.id })");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain('grant execute on function public.complete_employee_onboarding(uuid) to service_role');
  });
});
