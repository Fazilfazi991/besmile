export type PushWorkspace = 'admin' | 'employee';

const employeePrefixes = ['/employee/dashboard', '/employee/tasks', '/employee/leaves', '/employee/chat', '/employee/announcements', '/employee/notifications', '/employee/documents', '/employee/crm', '/employee/attendance', '/employee/profile'];
const adminPrefixes = ['/admin', '/employee/dashboard'];

export function safePushRoute(route: unknown, workspace: PushWorkspace) {
  const fallback = workspace === 'admin' ? '/admin/notifications' : '/employee/notifications';
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) return fallback;
  const allowed = workspace === 'admin' ? adminPrefixes : employeePrefixes;
  return allowed.some(prefix => route === prefix || route.startsWith(`${prefix}/`)) ? route : fallback;
}

export function workspaceForRole(role: unknown): PushWorkspace {
  return role === 'super_admin' ? 'admin' : 'employee';
}
