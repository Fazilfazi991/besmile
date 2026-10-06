import { describe, expect, it, vi } from 'vitest';
import { provisionExternalClinician } from './clinician-provisioning';
const input = { doctorId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: ' QA@Example.test ', requestId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', fields: { full_name: 'QA External' } };
const owned = { id: 'auth-a', email: 'qa@example.test', app_metadata: { clinician_provision_request_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', existing_clinician_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' } };
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
    const { session, service } = clients(); const password = crypto.randomUUID();
    expect(await provisionExternalClinician(session, service, input, password)).toEqual({ profileId: 'auth-a', replayed: false });
    expect(service.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'qa@example.test', email_confirm: true, password }));
    expect(service.rpc).toHaveBeenCalledWith('complete_clinician_provision', { request_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', auth_user_id: 'auth-a' });
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('completed requests return without touching Auth or requiring an initial credential', async () => {
    const { session, service } = clients(); session.rpc.mockResolvedValue({ data: { completed_at: 'now', profile_id: 'auth-a' }, error: null });
    expect(await provisionExternalClinician(session, service, input, undefined)).toEqual({ profileId: 'auth-a', replayed: true });
    expect(service.auth.admin.createUser).not.toHaveBeenCalled(); expect(service.rpc).not.toHaveBeenCalled();
  });
  it('recovers a failed link only for the request-owned Auth identity', async () => {
    const { session, service } = clients(); service.auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'exists' } } as any);
    service.auth.admin.listUsers.mockResolvedValue({ data: { users: [owned] }, error: null } as any);
    expect((await provisionExternalClinician(session, service, input, crypto.randomUUID())).replayed).toBe(true);
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it.each([{ ...owned, app_metadata: {} }, { ...owned, app_metadata: { ...owned.app_metadata, existing_clinician_id: 'another-doctor' } }])('cannot claim an unrelated account', async user => {
    const { session, service } = clients(); service.auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'exists' } } as any);
    service.auth.admin.listUsers.mockResolvedValue({ data: { users: [user] }, error: null } as any);
    await expect(provisionExternalClinician(session, service, input, crypto.randomUUID())).rejects.toThrow('another Auth account');
    expect(service.rpc).not.toHaveBeenCalled(); expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('authorization/reservation denial prevents Auth creation', async () => {
    const { session, service } = clients(); session.rpc.mockResolvedValue({ data: null, error: new Error('Permission denied') } as any);
    await expect(provisionExternalClinician(session, service, input, crypto.randomUUID())).rejects.toThrow('Permission denied');
    expect(service.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('missing email or missing configured credential does not create Auth', async () => {
    const { session, service } = clients(); await expect(provisionExternalClinician(session, service, { ...input, email: '' }, crypto.randomUUID())).rejects.toThrow('valid login email');
    await expect(provisionExternalClinician(session, service, input, undefined)).rejects.toThrow('not configured'); expect(service.auth.admin.createUser).not.toHaveBeenCalled();
  });
});
