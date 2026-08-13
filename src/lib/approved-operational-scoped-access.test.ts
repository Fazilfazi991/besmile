import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260813153420_approved_operational_scoped_access.sql'),
  'utf8',
);

describe('approved operational scoped access migration', () => {
  it('grants only the four approved account permissions', () => {
    expect(migration).toContain("('aishwaryabsmile@gmail.com', 'crm.view_assigned'");
    expect(migration).toContain("('internbsmile@gmail.com', 'crm.view_assigned'");
    expect(migration).toContain("('internbsmile@gmail.com', 'leave.self'");
    expect(migration).toContain("('salesheadbsmile@gmail.com', 'tasks.view_self'");
    expect(migration).not.toContain("('diyaassistantmanager@gmail.com'");
  });

  it('enforces clinical/direct assignment reads without granting sales', () => {
    expect(migration).toContain("public.patient_access(clinical_client)");
    expect(migration).toContain("target = auth.uid()");
    expect(migration).toContain("lead.assigned_to = auth.uid() and public.has_permission('sales.view')");
    expect(migration).not.toContain("public.has_permission('sales.view') or public.has_permission('crm.view_assigned')");
    expect(migration).toContain('drop policy if exists "crm sales access"');
  });

  it('keeps follow-up writes and leave cancellation behind server-side boundaries', () => {
    expect(migration).toContain("public.has_permission('leads.edit')");
    expect(migration).toContain("and status = 'pending'");
    expect(migration).toContain("status in ('cancelled', 'withdrawn')");
  });
});
