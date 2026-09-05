export type ContextualBackTarget = {
  href: string;
  label: string;
};

const targets: Array<{ pattern: RegExp; target: ContextualBackTarget }> = [
  { pattern: /^\/admin\/employees\/(?:new|[^/]+)$/, target: { href: '/admin/employees', label: 'Back to employees' } },
  { pattern: /^\/admin\/patients\/(?:new|[^/]+)$/, target: { href: '/admin/patients', label: 'Back to patients' } },
  { pattern: /^\/admin\/crm\/leads\/[^/]+$/, target: { href: '/admin/crm/leads', label: 'Back to leads' } },
  { pattern: /^\/admin\/crm\/import$/, target: { href: '/admin/crm/leads', label: 'Back to leads' } },
  { pattern: /^\/admin\/finance\/invoices\/(?:new|[^/]+)$/, target: { href: '/admin/finance/invoices', label: 'Back to invoices' } },
  { pattern: /^\/admin\/finance\/payroll\/[^/]+$/, target: { href: '/admin/finance/payroll', label: 'Back to payroll' } },
  { pattern: /^\/admin\/documents\/generate$/, target: { href: '/admin/documents', label: 'Back to documents' } },
  { pattern: /^\/admin\/ideas\/new$/, target: { href: '/admin/ideas', label: 'Back to Innovation Hub' } },
  { pattern: /^\/admin\/ideas\/categories$/, target: { href: '/admin/ideas', label: 'Back to Innovation Hub' } },
  { pattern: /^\/admin\/ideas\/[^/]+$/, target: { href: '/admin/ideas', label: 'Back to Innovation Hub' } },
  { pattern: /^\/employee\/announcements\/[^/]+$/, target: { href: '/employee/announcements', label: 'Back to announcements' } },
  { pattern: /^\/employee\/patients\/[^/]+$/, target: { href: '/employee/patients', label: 'Back to patients' } },
  { pattern: /^\/employee\/crm\/leads\/[^/]+$/, target: { href: '/employee/crm/leads', label: 'Back to my leads' } },
  { pattern: /^\/employee\/ideas\/new$/, target: { href: '/employee/ideas', label: 'Back to Innovation Hub' } },
  { pattern: /^\/employee\/ideas\/[^/]+$/, target: { href: '/employee/ideas', label: 'Back to Innovation Hub' } },
  { pattern: /^\/employee\/tasks\/(?:access|manage)$/, target: { href: '/employee/tasks', label: 'Back to tasks' } },
];

export function contextualBackTarget(pathname: string): ContextualBackTarget | null {
  return targets.find(({ pattern }) => pattern.test(pathname))?.target ?? null;
}
