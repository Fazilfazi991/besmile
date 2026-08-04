import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const commandCenter = readFileSync(new URL('../components/global-command-center.tsx', import.meta.url), 'utf8');
const adminLeaves = readFileSync(new URL('../app/admin/leaves/page.tsx', import.meta.url), 'utf8');
const employeeLeaves = readFileSync(new URL('../app/employee/leaves/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0074_patient_source_and_leave_notification_deeplinks.sql'), 'utf8');

describe('notification navigation freshness', () => {
  it('routes leave notifications to request-specific destinations', () => {
    expect(commandCenter).toContain('/admin/leaves?request=');
    expect(commandCenter).toContain('/employee/leaves?request=');
    expect(migration).toContain("'/admin/leaves?request='||new.id::text");
    expect(migration).toContain("'/employee/leaves?request='||new.id::text");
  });

  it('marks read optimistically and refreshes after navigation', () => {
    expect(commandCenter).toContain('setBellOpen(false)');
    expect(commandCenter).toContain('router.push(destination)');
    expect(commandCenter).toContain('router.refresh()');
    expect(commandCenter).toContain("console.warn('[Notifications] mark read failed'");
  });

  it('leave pages can highlight linked requests and show missing-record feedback', () => {
    for (const source of [adminLeaves, employeeLeaves]) {
      expect(source).toContain("searchParams.get('request')");
      expect(source).toContain('leave-request-${request.id}');
      expect(source).toContain('This request is no longer available.');
    }
  });
});
