import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const permissions = readFileSync(new URL('./permission-access.ts', import.meta.url), 'utf8');

describe('canonical workspace route architecture', () => {
  it('ships the management task route linked by the admin navigation', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/admin/tasks/page.tsx'))).toBe(true);
    expect(permissions).toContain("href: '/admin/tasks'");
    expect(permissions).toContain("path === '/admin/tasks'");
  });

  it('keeps operational attendance, chat, notifications, tasks, and CRM in the employee workspace', () => {
    for (const route of ['/employee/attendance', '/employee/chat', '/employee/notifications', '/employee/tasks', '/employee/crm']) {
      expect(permissions).toContain(route);
    }
  });
});
