import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/0057_crm_sales_scoped_policy_fix.sql', import.meta.url),
  'utf8',
);

describe('CRM sales scoped RLS policy', () => {
  it('checks access through the linked lead assignment scope', () => {
    expect(migration).toContain('create or replace function public.crm_sale_access');
    expect(migration).toContain('lead.assigned_to = auth.uid()');
    expect(migration).toContain('public.crm_can_manage(lead.assigned_to)');
  });

  it('uses the helper for both reads and writes', () => {
    expect(migration).toContain('using (public.crm_sale_access(lead_id))');
    expect(migration).toContain('with check (public.crm_sale_access(lead_id))');
  });
});
