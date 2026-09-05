import { describe, expect, it } from 'vitest';
import { contextualBackTarget } from './contextual-back-navigation';

describe('contextualBackTarget', () => {
  it.each([
    ['/admin/employees/employee-id', '/admin/employees', 'Back to employees'],
    ['/admin/employees/new', '/admin/employees', 'Back to employees'],
    ['/admin/patients/patient-id', '/admin/patients', 'Back to patients'],
    ['/admin/crm/leads/lead-id', '/admin/crm/leads', 'Back to leads'],
    ['/admin/finance/invoices/invoice-id', '/admin/finance/invoices', 'Back to invoices'],
    ['/admin/finance/invoices/new', '/admin/finance/invoices', 'Back to invoices'],
    ['/admin/finance/payroll/run-id', '/admin/finance/payroll', 'Back to payroll'],
    ['/admin/documents/generate', '/admin/documents', 'Back to documents'],
    ['/admin/ideas/idea-id', '/admin/ideas', 'Back to Innovation Hub'],
    ['/employee/announcements/announcement-id', '/employee/announcements', 'Back to announcements'],
    ['/employee/crm/leads/lead-id', '/employee/crm/leads', 'Back to my leads'],
    ['/employee/tasks/manage', '/employee/tasks', 'Back to tasks'],
  ])('maps %s to its permission-safe parent', (pathname, href, label) => {
    expect(contextualBackTarget(pathname)).toEqual({ href, label });
  });

  it.each([
    '/admin',
    '/admin/employees',
    '/admin/chat',
    '/admin/notifications',
    '/employee/dashboard',
    '/employee/chat',
    '/employee/notifications',
    '/clinician/schedule',
    '/clinician/notifications',
    '/clinician/profile',
  ])('does not add Back to a root route: %s', (pathname) => {
    expect(contextualBackTarget(pathname)).toBeNull();
  });
});
