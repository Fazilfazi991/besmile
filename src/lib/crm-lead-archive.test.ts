import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc } }));
import { adminRepository } from './admin-repository';

describe('CRM lead archive persistence', () => {
  beforeEach(() => rpc.mockReset());
  it('archives exactly the requested lead using the invoker RPC receipt', async () => {
    const receipt = { id: 'approved-id', archived_at: '2026-09-10T08:00:00Z' };
    rpc.mockResolvedValue({ data: receipt, error: null });
    expect(await adminRepository.archiveLead('approved-id')).toEqual(receipt);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('archive_crm_lead', { target_lead: 'approved-id' });
  });
  it('propagates permission failure instead of reporting success', async () => {
    const error = { code: '42501', message: 'Permission denied' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(adminRepository.archiveLead('denied')).rejects.toEqual(error);
  });
  it.each([null, {}, { id: 'approved-id' }, { id: 'wrong-id', archived_at: '2026-09-10' }])('rejects an unverified receipt %j', async data => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(adminRepository.archiveLead('approved-id')).rejects.toThrow('Lead archive did not persist');
  });
  it('retains RLS and hidden archive behavior without privileged execution', () => {
    const migration = readFileSync(new URL('../../supabase/migrations/20260910080305_archive_crm_lead_without_returning.sql', import.meta.url), 'utf8');
    const sql = migration.replace(/--[^\n]*/g, '').toLowerCase();
    expect(sql).toContain('security invoker');
    expect(sql).toContain('auth.uid() is null');
    expect(sql).toContain('where id = target_lead and archived_at is null');
    expect(sql).toContain('get diagnostics affected = row_count');
    expect(sql).toContain('for update');
    expect(sql).toContain('where current of archive_cursor');
    expect(sql).toContain('affected <> 1');
    expect(sql).toContain('from public, anon');
    expect(sql).not.toMatch(/security definer|returning|create policy|alter policy|disable row level/);
  });
});
