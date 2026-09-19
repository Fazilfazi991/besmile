import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260919162211_optimize_notifications_rls_for_dashboard.sql', import.meta.url), 'utf8');

describe('management dashboard stability', () => {
  it('does not block the dashboard on an unused organization-wide notification count', () => {
    expect(repository).not.toContain("r.from('notifications').select('*',{count:'exact',head:true}).is('read_at',null)");
    expect(repository).not.toContain('unreadNotifications:unreadNotifications.count');
  });

  it('renders a terminal error with retry instead of an endless loading skeleton', () => {
    expect(dashboard).toContain("useState<'loading' | 'ready' | 'error'>('loading')");
    expect(dashboard).toContain("setSummaryState('error')");
    expect(dashboard).toContain('DashboardLoadError retry={() => void load()}');
    expect(dashboard).not.toContain('if (!summary) return <DashboardSkeleton />;');
  });

  it('keeps notification RLS semantics while caching caller-only checks', () => {
    expect(migration).toContain('profile_id = (select auth.uid())');
    expect(migration).toContain('or (select public.is_management())');
    expect(migration).toContain("(select public.current_role()) = 'general_manager'");
    expect(migration).toContain("or (select public.has_permission('admin.access'))");
    expect(migration).toContain('and public.in_management_tree(profile_id)');
  });
});
