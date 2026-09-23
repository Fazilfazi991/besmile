import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  department: true, managerActive: true, allowed: true,
  invite: vi.fn(), insert: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: fixture.revalidate }));
vi.mock('@/lib/supabase-server', () => ({ serverSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
  rpc: async () => ({ data: fixture.allowed }),
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'profiles' ? { id: 'viewer', role: 'director', status: 'active' } : fixture.department ? { id: 'department' } : null }) };
    return query;
  },
}) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { admin: { inviteUserByEmail: fixture.invite, deleteUser: vi.fn() } },
  from: () => {
    const query = { select: () => query, eq: () => query, or: () => query, limit: async () => ({ data: [] }), insert: fixture.insert,
      maybeSingle: async () => ({ data: { id: 'manager', status: fixture.managerActive ? 'active' : 'inactive', role: 'staff', is_employee: true, workforce_visible: true, removed_at: null } }) };
    return query;
  },
}) }));
import { createEmployee } from '@/app/admin/employees/new/actions';

const form = () => {
  const data = new FormData();
  Object.entries({ full_name: 'QA employee', email: 'qa@example.test', gender: 'Female', employee_code: 'QA001', department_id: 'department', designation: 'Coordinator', role: 'staff', manager_id: 'manager', status: 'active' }).forEach(([key,value]) => data.set(key,value));
  return data;
};
beforeEach(() => {
  fixture.department = true; fixture.managerActive = true; fixture.allowed = true;
  fixture.invite.mockReset().mockResolvedValue({ data: { user: { id: 'new-user' } } });
  fixture.insert.mockReset().mockResolvedValue({ error: null }); fixture.revalidate.mockClear();
});
describe('organization fields in employee creation', () => {
  it('persists canonical department and manager IDs without changing the authorization role', async () => {
    expect((await createEmployee({}, form())).success).toContain('created');
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-user', department_id: 'department', manager_id: 'manager', designation: 'Coordinator', role: 'staff' }));
  });
  it('rejects an invalid department before sending an invitation', async () => {
    fixture.department = false;
    expect((await createEmployee({}, form())).error).toContain('active department');
    expect(fixture.invite).not.toHaveBeenCalled();
  });
  it('rejects an inactive manager before sending an invitation', async () => {
    fixture.managerActive = false;
    expect((await createEmployee({}, form())).error).toContain('active employee');
    expect(fixture.invite).not.toHaveBeenCalled();
  });
  it('requires employee creation permission', async () => {
    fixture.allowed = false;
    expect((await createEmployee({}, form())).error).toContain('permission');
    expect(fixture.invite).not.toHaveBeenCalled();
  });
});
