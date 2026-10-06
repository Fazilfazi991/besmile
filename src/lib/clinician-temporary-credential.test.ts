import { describe, expect, it, vi } from 'vitest';
import { regenerateClinicianTemporaryCredential } from './clinician-temporary-credential';

const input = { doctorId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', requestId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' };
const identity = { id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', email: 'qa@example.test', email_confirmed_at: '2026-10-01', last_sign_in_at: null, app_metadata: { existing_clinician_id: input.doctorId } };
function clients() {
  return {
    session: { rpc: vi.fn().mockResolvedValue({ data: { newly_reserved: true, profile_id: identity.id, login_email: identity.email, status: 'pending' }, error: null }) },
    service: { rpc: vi.fn().mockResolvedValue({ data: true, error: null }), auth: { admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user: identity }, error: null }),
      updateUserById: vi.fn().mockResolvedValue({ data: { user: identity }, error: null }),
    } } },
  };
}
describe('one-time clinician credential recovery', () => {
  it('changes only password, returns it once, and sends no secret to persistence RPCs', async () => {
    const { session, service } = clients();
    const result = await regenerateClinicianTemporaryCredential(session, service, input);
    const [id, patch] = service.auth.admin.updateUserById.mock.calls[0];
    expect(id).toBe(identity.id); expect(Object.keys(patch)).toEqual(['password']);
    expect(patch.password === result.temporaryPassword).toBe(true);
    expect(/^[A-Za-z0-9_-]{32}$/.test(result.temporaryPassword!)).toBe(true);
    expect(JSON.stringify([...session.rpc.mock.calls, ...service.rpc.mock.calls]).includes(result.temporaryPassword!)).toBe(false);
    expect(service.rpc).toHaveBeenCalledWith('finish_clinician_temporary_credential', { request_id: input.requestId, succeeded: true });
  });
  it('completed replay never looks up Auth, writes password or returns a secret', async () => {
    const { session, service } = clients(); session.rpc.mockResolvedValue({ data: { status: 'completed', profile_id: identity.id, newly_reserved: false }, error: null } as any);
    expect(await regenerateClinicianTemporaryCredential(session, service, input)).toEqual({ profileId: identity.id, replayed: true });
    expect(service.auth.admin.getUserById).not.toHaveBeenCalled(); expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('pending replay cannot perform a second Auth update', async () => {
    const { session, service } = clients(); session.rpc.mockResolvedValue({ data: { status: 'pending', profile_id: identity.id, newly_reserved: false }, error: null } as any);
    await expect(regenerateClinicianTemporaryCredential(session, service, input)).rejects.toThrow('already started');
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it.each([
    { ...identity, last_sign_in_at: '2026-10-06' },
    { ...identity, email_confirmed_at: null },
    { ...identity, banned_until: '2099-01-01' },
    { ...identity, email: 'wrong@example.test' },
    { ...identity, app_metadata: { existing_clinician_id: 'wrong-doctor' } },
  ])('rejects changed or ineligible live Auth identity', async user => {
    const { session, service } = clients(); service.auth.admin.getUserById.mockResolvedValue({ data: { user }, error: null } as any);
    await expect(regenerateClinicianTemporaryCredential(session, service, input)).rejects.toThrow('manual credential review');
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('manager/eligibility denial stops before Auth access', async () => {
    const { session, service } = clients(); session.rpc.mockResolvedValue({ data: null, error: new Error('Permission denied') } as any);
    await expect(regenerateClinicianTemporaryCredential(session, service, input)).rejects.toThrow('Permission denied');
    expect(service.auth.admin.getUserById).not.toHaveBeenCalled();
  });
  it('revoked manager scope or changed profile/linkage after reservation prevents password mutation', async () => {
    const { session, service } = clients(); service.rpc.mockResolvedValue({ data: false, error: null });
    await expect(regenerateClinicianTemporaryCredential(session, service, input)).rejects.toThrow('manual credential review');
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it.each(['auth', 'audit'])('uncertain %s completion keeps the request pending for manual review', async stage => {
    const { session, service } = clients();
    if (stage === 'auth') service.auth.admin.updateUserById.mockResolvedValue({ error: new Error('transport failure') } as any);
    else service.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ error: new Error('audit failure') } as any);
    await expect(regenerateClinicianTemporaryCredential(session, service, input)).rejects.toThrow('Do not repeat');
    expect(service.rpc.mock.calls.some(([, args]) => args.succeeded === false)).toBe(false);
  });
});
