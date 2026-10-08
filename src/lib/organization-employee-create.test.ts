import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  department: true, managerActive: true, allowed: true, viewerStatus: 'active',
  duplicates: [] as Record<string, unknown>[],
  create: vi.fn(), update: vi.fn(), getUser: vi.fn(), listUsers: vi.fn(), insert: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: fixture.revalidate }));
vi.mock('@/lib/supabase-server', () => ({ serverSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
  rpc: async () => ({ data: fixture.allowed }),
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'profiles' ? { id: 'viewer', role: 'director', status: fixture.viewerStatus } : fixture.department ? { id: 'department' } : null }) };
    return query;
  },
}) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { admin: { createUser: fixture.create, updateUserById: fixture.update, getUserById: fixture.getUser, listUsers: fixture.listUsers } },
  from: () => {
    const query = { select: () => query, eq: () => query, or: () => query, limit: async () => ({ data: fixture.duplicates }), insert: fixture.insert,
      maybeSingle: async () => ({ data: { id: 'manager', status: fixture.managerActive ? 'active' : 'inactive', role: 'staff', is_employee: true, workforce_visible: true, removed_at: null } }) };
    return query;
  },
}) }));
import { createEmployee } from '@/app/admin/employees/new/actions';

const form = () => {
  const data = new FormData();
  Object.entries({ full_name: 'QA employee', work_email: 'work@example.test', login_email: 'qa@example.test', provisioning_request_id: 'request-id-12345', gender: 'Female', employee_code: 'QA001', department_id: 'department', designation: 'Coordinator', role: 'staff', manager_id: 'manager', status: 'active' }).forEach(([key,value]) => data.set(key,value));
  return data;
};
beforeEach(() => {
  process.env.EMPLOYEE_INITIAL_PASSWORD = 'DummyPassword!234';
  fixture.department = true; fixture.managerActive = true; fixture.allowed = true;
  fixture.viewerStatus = 'active'; fixture.duplicates = [];
  fixture.create.mockReset().mockResolvedValue({ data: { user: { id: 'new-user' } } });
  fixture.update.mockReset().mockResolvedValue({ error: null });
  fixture.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'new-user', email: 'qa@example.test', app_metadata: {} } } });
  fixture.listUsers.mockReset().mockResolvedValue({ data: { users: [] }, error: null });
  fixture.insert.mockReset().mockResolvedValue({ error: null }); fixture.revalidate.mockClear();
});
describe('organization fields in employee creation', () => {
  it('persists canonical department and manager IDs without changing the authorization role', async () => {
    expect((await createEmployee({}, form())).success).toContain('created');
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-user', email: 'qa@example.test', work_email: 'work@example.test', department_id: 'department', manager_id: 'manager', designation: 'Coordinator', role: 'staff', onboarding_required: true }));
  });
  it('rejects an invalid department before creating an authentication account', async () => {
    fixture.department = false;
    expect((await createEmployee({}, form())).error).toContain('active department');
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it('rejects an inactive manager before creating an authentication account', async () => {
    fixture.managerActive = false;
    expect((await createEmployee({}, form())).error).toContain('active employee');
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it('requires employee creation permission', async () => {
    fixture.allowed = false;
    expect((await createEmployee({}, form())).error).toContain('permission');
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
  });
  it('confirms only the newly provisioned login account while requiring password onboarding', async () => {
    // The starter may be shorter than the private password chosen at onboarding.
    process.env.EMPLOYEE_INITIAL_PASSWORD = 'Starter!2345';
    const data = form();
    data.set('login_email', '  QA@EXAMPLE.TEST  ');
    const result = await createEmployee({}, data);
    expect(result.success).toContain('login email confirmed');
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith({ email: 'qa@example.test', password: process.env.EMPLOYEE_INITIAL_PASSWORD, email_confirm: true, app_metadata: { employee_provision_request_id: 'request-id-12345', onboarding_required: true } });
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith('new-user', expect.objectContaining({
      email_confirm: true, password: process.env.EMPLOYEE_INITIAL_PASSWORD,
      app_metadata: { employee_provision_request_id: 'request-id-12345', onboarding_required: true },
    }));
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-user', onboarding_required: true, role: 'staff' }));
  });
  it('reserves the same account for recovery when credential and confirmation provisioning fails', async () => {
    fixture.update.mockResolvedValue({ error: { message: 'Temporary provisioning failure' } });
    const result = await createEmployee({}, form());
    expect(result.success).toBeUndefined();
    expect(result.error).toContain('Retry this same form');
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-user', employee_provision_request_id: 'request-id-12345', onboarding_required: true }));
  });
  it('confirms the reserved account when the same unfinished creation request is retried', async () => {
    fixture.duplicates = [{ id: 'new-user', full_name: 'QA employee', email: 'qa@example.test', work_email: 'work@example.test', employee_code: 'QA001', department_id: 'department', designation: 'Coordinator', role: 'staff', manager_id: 'manager', joining_date: null, employment_type: null, status: 'active', onboarding_required: true, employee_provision_request_id: 'request-id-12345' }];
    const result = await createEmployee({}, form());
    expect(result.success).toContain('already created');
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith('new-user', expect.objectContaining({ email_confirm: true, password: process.env.EMPLOYEE_INITIAL_PASSWORD }));
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.insert).not.toHaveBeenCalled();
  });
  it('does not reset the password or confirmation state on replay of a provisioned account', async () => {
    fixture.duplicates = [{ id: 'new-user', full_name: 'QA employee', email: 'qa@example.test', work_email: 'work@example.test', employee_code: 'QA001', department_id: 'department', designation: 'Coordinator', role: 'staff', manager_id: 'manager', joining_date: null, employment_type: null, status: 'active', onboarding_required: true, employee_provision_request_id: 'request-id-12345' }];
    fixture.getUser.mockResolvedValue({ data: { user: { id: 'new-user', app_metadata: { employee_provision_request_id: 'request-id-12345' } } } });
    expect((await createEmployee({}, form())).success).toContain('already created');
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it('never confirms an existing Auth account owned by another provisioning request', async () => {
    fixture.create.mockResolvedValue({ data: { user: null }, error: { message: 'Account already exists' } });
    fixture.listUsers.mockResolvedValue({ data: { users: [{ id: 'other-account', email: 'qa@example.test', app_metadata: { employee_provision_request_id: 'other-request' } }] } });
    expect((await createEmployee({}, form())).error).toContain('Account already exists');
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.insert).not.toHaveBeenCalled();
  });
  it('does not touch Auth on replay after private-password onboarding is completed', async () => {
    fixture.duplicates = [{ id: 'new-user', full_name: 'QA employee', email: 'qa@example.test', work_email: 'work@example.test', employee_code: 'QA001', department_id: 'department', designation: 'Coordinator', role: 'staff', manager_id: 'manager', joining_date: null, employment_type: null, status: 'active', onboarding_required: false, employee_provision_request_id: 'request-id-12345' }];
    expect((await createEmployee({}, form())).success).toContain('already created');
    expect(fixture.getUser).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it('rejects an existing CRM profile from another request without changing Auth', async () => {
    fixture.duplicates = [{ id: 'other-account', employee_provision_request_id: 'other-request' }];
    expect((await createEmployee({}, form())).error).toContain('already exists');
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it('denies employee creation to an inactive caller before provisioning or confirmation', async () => {
    fixture.viewerStatus = 'inactive';
    expect((await createEmployee({}, form())).error).toContain('permission');
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });
});
