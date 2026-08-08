const employeeToAdminPrefixes: ReadonlyArray<readonly [string, string]> = [
  ['/employee/dashboard', '/admin'],
  ['/employee/tasks', '/admin/tasks'],
  ['/employee/leaves', '/admin/leaves'],
  ['/employee/documents', '/admin/documents'],
  ['/employee/announcements', '/admin/announcements'],
  ['/employee/crm', '/admin/crm'],
  ['/employee/attendance', '/admin/attendance'],
  ['/employee/profile', '/admin/profile'],
  ['/employee/notifications', '/admin/notifications'],
];

export function adminNotificationTarget(deepLink: string): string {
  const match = employeeToAdminPrefixes.find(([employeePrefix]) => deepLink === employeePrefix || deepLink.startsWith(`${employeePrefix}?`) || deepLink.startsWith(`${employeePrefix}/`));
  return match ? `${match[1]}${deepLink.slice(match[0].length)}` : deepLink;
}
