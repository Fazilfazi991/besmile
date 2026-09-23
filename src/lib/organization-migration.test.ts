import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql=readFileSync('supabase/migrations/20260923185924_dynamic_organization_chart.sql','utf8');
describe('organization database security contract', () => {
  it('projects organization fields without exposing private HR records', () => {
    const projection=sql.split('returns table(')[1].split(')')[0];
    for(const field of ['email','phone','bank','salary']) expect(projection).not.toContain(field);
    expect(sql).toContain("viewer.id=auth.uid() and viewer.status='active'");
    expect(sql).toContain('revoke all on function public.organization_directory() from public,anon');
  });
  it('requires explicit permission and preserves protected employee boundaries', () => {
    expect(sql).toContain("raise exception 'Organization editing is not permitted' using errcode='42501'");
    expect(sql).toContain('public.profile_role_is_protected(target.role::text)');
    expect(sql).toContain("r.code in ('super_admin','chairman','director')");
    expect(sql).not.toContain("'guest_sales','organization_chart.manage'");
  });
  it('serializes validation and constrains Chairman and cycles at the database boundary', () => {
    expect(sql).toContain('pg_advisory_xact_lock(824713092)');
    expect(sql).toContain('new.manager_id=new.id');
    expect(sql).toContain('union select p.id,p.manager_id');
    expect(sql).toContain("='chairman'");
  });
  it('seeds separate canonical departments and persists custom names instead of Other', () => {
    expect(sql).toContain("values ('Business Development'), ('Marketing') on conflict (name) do nothing");
    expect(sql).toContain("lower(clean_name)='other'");
    expect(sql).toContain('security invoker');
  });
});
