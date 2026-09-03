import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('dashboard critical path', () => {
  it('reuses the authenticated layout session instead of querying it again', () => {
    const layout = read('../app/admin/layout.tsx');
    const dashboard = read('../app/admin/page.tsx');
    expect(layout).toContain('<WorkspaceSessionProvider');
    expect(dashboard).toContain('useWorkspaceSession()');
    expect(dashboard).not.toContain("from '@/lib/auth'");
    expect(dashboard).not.toContain('employeeRepository.grantedPermissions');
  });

  it('does not prefetch every employee detail route in the performance strip', () => {
    expect(read('../components/team-attendance-strip.tsx')).toContain('prefetch={false}');
  });

  it('defers external feedback until the browser is idle', () => {
    expect(read('../components/customer-feedback-dashboard-widget.tsx')).toContain('requestIdleCallback(load');
  });
});
