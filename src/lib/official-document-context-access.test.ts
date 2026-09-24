import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ access: { allowedTypes: [] as string[], canUploadMom: false, manager: false } }));
vi.mock('@/lib/supabase-server', () => ({ serverSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'approved-user' } } }) },
  from: (table: string) => table === 'profiles'
    ? { select: () => ({ eq: () => ({ single: async () => ({ data: { full_name: 'Approved user' }, error: null }) }) }) }
    : { select: () => ({ like: () => ({ eq: () => ({ or: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }) },
}) }));
vi.mock('@/lib/official-document-access', () => ({ officialDocumentAccess: async () => state.access }));

import { GET } from '@/app/api/documents/official/context/route';

beforeEach(() => { state.access = { allowedTypes: [], canUploadMom: false, manager: false }; });

describe('official document context authorization', () => {
  it('serves the existing MOM workflow without a generation or management grant', async () => {
    state.access.canUploadMom = true;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ allowedTypes: [], canUploadMom: true, history: [] });
  });

  it('blocks users without MOM or generation access', async () => {
    const response = await GET();
    expect(response.status).toBe(403);
  });
});
