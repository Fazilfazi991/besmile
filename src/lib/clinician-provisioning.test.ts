import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provisionExternalClinician } from './clinician-provisioning';
const input = { doctorId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: ' QA@Example.test ', requestId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', fields: { full_name: 'QA External' } };
const owned = { id: 'auth-a', email: 'qa@example.test', app_metadata: { clinician_provision_request_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', existing_clinician_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' } };
beforeEach(() => vi.stubEnv('EMPLOYEE_INITIAL_PASSWORD', 'Starter!2345'));
function clients() {
  const session = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
  const service = { rpc: vi.fn().mockResolvedValue({ data: owned.id, error: null }), auth: { admin: {
    createUser: vi.fn().mockResolvedValue({ data: { user: owned }, error: null }),
    listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }), updateUserById: vi.fn(),
  } } };
  return { session, service };
}
describe('external clinician provisioning ownership', () => {
  it('normalizes email, confirms it and links the existing clinician', async () => {
    const { session, service } = clients();
    const result = await provisionExternalClinician(session, service, input);
    expect(result.profileId).toBe('auth-a'); expect(result.replayed).toBe(false);
    const created = service.auth.admin.createUser.mock.calls[0][0];
    expect(created.email).toBe('qa@example.test'); expect(created.email_confirm).toBe(true);
    expect(created.password === result.temporaryPassword).toBe(true);
    expect(result.temporaryPassword).toBe(process.env.EMPLOYEE_INITIAL_PASSWORD);
    expect(service.rpc).toHaveBeenCalledWith('complete_clinician_provision', { request_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', auth_user_id: 'auth-a' });
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('completed requests return without touching Auth or requiring an initial credential', async () => {
    const { session, service } = clients(); session.rpc.mockResolvedValue({ data: { completed_at: 'now', profile_id: 'auth-a' }, error: null });
    expect(await provisionExternalClinician(session, service, input)).toEqual({ profileId: 'auth-a', replayed: true });
    expect(service.auth.admin.createUser).not.toHaveBeenCalled(); expect(service.rpc).not.toHaveBeenCalled();
  });
  it('recovers a failed link only for the request-owned Auth identity', async () => {
    const { session, service } = clients(); service.auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'exists' } } as any);
    service.auth.admin.listUsers.mockResolvedValue({ data: { users: [owned] }, error: null } as any);
    const result = await provisionExternalClinician(session, service, input);
    expect(result.replayed).toBe(true); expect(result.temporaryPassword === undefined).toBe(true);
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it.each([{ ...owned, app_metadata: {} }, { ...owned, app_metadata: { ...owned.app_metadata, existing_clinician_id: 'another-doctor' } }])('cannot claim an unrelated account', async user => {
    const { session, service } = clients(); service.auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'exists' } } as any);
    service.auth.admin.listUsers.mockResolvedValue({ data: { users: [user] }, error: null } as any);
    await expect(provisionExternalClinician(session, service, input)).rejects.toThrow('another Auth account');
    expect(service.rpc).not.toHaveBeenCalled(); expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('authorization/reservation denial prevents Auth creation', async () => {
    const { session, service } = clients(); session.rpc.mockResolvedValue({ data: null, error: new Error('Permission denied') } as any);
    await expect(provisionExternalClinician(session, service, input)).rejects.toThrow('Permission denied');
    expect(service.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('missing email does not create Auth', async () => {
    const { session, service } = clients(); await expect(provisionExternalClinician(session, service, { ...input, email: '' })).rejects.toThrow('valid login email');
    expect(service.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('new accounts use the configured starter without persisting it in CRM or metadata', async () => {
    const a = clients(), b = clients();
    const first = await provisionExternalClinician(a.session, a.service, input);
    const second = await provisionExternalClinician(b.session, b.service, input);
    expect(first.temporaryPassword).toBe(process.env.EMPLOYEE_INITIAL_PASSWORD);
    expect(second.temporaryPassword).toBe(first.temporaryPassword);
    for (const [client, result] of [[a, first], [b, second]] as const) {
      expect(JSON.stringify(client.session.rpc.mock.calls).includes(result.temporaryPassword!)).toBe(false);
      expect(JSON.stringify(client.service.rpc.mock.calls).includes(result.temporaryPassword!)).toBe(false);
      expect(JSON.stringify(client.service.auth.admin.createUser.mock.calls[0][0].app_metadata).includes(result.temporaryPassword!)).toBe(false);
    }
  });
  it('does not create Auth when the starter is unconfigured', async () => {
    vi.stubEnv('EMPLOYEE_INITIAL_PASSWORD', '');
    const { session, service } = clients();
    await expect(provisionExternalClinician(session, service, input)).rejects.toThrow('not configured');
    expect(service.auth.admin.createUser).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });
});
