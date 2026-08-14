import { describe, expect, it, vi } from 'vitest';
import { adminDashboardCapabilities, runAdminDashboardRequestPlan, type AdminDashboardRequestKey, type AdminDashboardRequests } from './admin-dashboard-request-plan';

function requests() {
  const request = () => vi.fn().mockResolvedValue({});
  return {
    workforce: request(), leave: request(), task: request(), crm: request(), documentApproval: request(),
    notification: request(), finance: request(), scheduling: request(), audit: request(),
  } satisfies AdminDashboardRequests;
}

describe('admin dashboard scoped request plan', () => {
  it('never invokes denied scoped or sensitive requests', async () => {
    const calls = requests();
    await runAdminDashboardRequestPlan(new Set(), calls);
    for (const request of Object.values(calls)) expect(request).toHaveBeenCalledTimes(0);
  });

  it.each([
    ['attendance.view', 'workforce'],
    ['leave.approve', 'leave'],
    ['tasks.manage', 'task'],
    ['crm.view_team', 'crm'],
    ['documents.manage', 'documentApproval'],
    ['notifications.view', 'notification'],
    ['finance.dashboard.view', 'finance'],
    ['doctor_scheduling.view', 'scheduling'],
    ['audit.view', 'audit'],
  ] as const)('invokes only the request allowed by %s', async (permission, allowedKey) => {
    const calls = requests();
    await runAdminDashboardRequestPlan(new Set([permission]), calls);
    for (const [key, request] of Object.entries(calls)) expect(request).toHaveBeenCalledTimes(key === allowedKey ? 1 : 0);
  });

  it('starts all authorized independent requests before awaiting completion', async () => {
    const started: AdminDashboardRequestKey[] = [];
    const resolvers: Partial<Record<AdminDashboardRequestKey, () => void>> = {};
    const calls: AdminDashboardRequests = requests();
    for (const key of Object.keys(calls) as AdminDashboardRequestKey[]) calls[key] = vi.fn(() => new Promise<void>(resolve => { started.push(key); resolvers[key] = resolve; }));
    const pending = runAdminDashboardRequestPlan(new Set(['attendance.view', 'leave.approve', 'tasks.manage', 'crm.view_team', 'documents.manage', 'notifications.view', 'finance.view', 'doctor_scheduling.view', 'audit.view']), calls);
    expect(started).toEqual(['workforce', 'leave', 'task', 'crm', 'documentApproval', 'notification', 'finance', 'scheduling', 'audit']);
    Object.values(resolvers).forEach(resolve => resolve?.());
    await pending;
  });

  it('uses the canonical effective permission set for direct grants and revokes', () => {
    const effectivePermissions = new Set<string>();
    expect(adminDashboardCapabilities(effectivePermissions).crm).toBe(false);
    effectivePermissions.add('crm.view_team');
    expect(adminDashboardCapabilities(effectivePermissions).crm).toBe(true);
    effectivePermissions.delete('crm.view_team');
    expect(adminDashboardCapabilities(effectivePermissions).crm).toBe(false);
  });
});
