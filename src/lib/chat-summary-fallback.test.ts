import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
import { employeeRepository } from './employee-repository';

describe('staff conversation summary fallback', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('uses the existing membership-scoped queries after a summary timeout', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'chat_conversation_summaries'
      ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
      : { data: false, error: null });
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), is: vi.fn(() => query), order: vi.fn(async () => ({ data: [], error: null })) };
    mocks.from.mockImplementation(() => query);
    // The mention query ends at eq(), while the membership query continues.
    query.then = (resolve: any) => resolve({ data: [], error: null });
    expect(await employeeRepository.conversations('staff-id')).toEqual([]);
    expect(query.eq).toHaveBeenCalledWith('profile_id', 'staff-id');
    expect(query.is).toHaveBeenCalledWith('chat_conversations.archived_at', null);
  });
  it('does not treat permission denial as a timeout', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'chat_conversation_summaries'
      ? { data: null, error: { code: '42501', message: 'Permission denied' } }
      : { data: false, error: null });
    await expect(employeeRepository.conversations('staff-id')).rejects.toMatchObject({ code: '42501' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
