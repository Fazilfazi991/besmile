import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: {} as any, sign: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ serverSupabase: async () => mocks.db }));
vi.mock('@/lib/storage/storage-service', () => ({ patientStorage: () => ({ createSignedDownloadUrl: mocks.sign }) }));
import { POST } from '../app/api/patients/[patientId]/documents/[documentId]/signed-url/route';

describe('patient document signed access endpoint', () => {
  let query: any;
  beforeEach(() => {
    vi.clearAllMocks();
    query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { storage_key: 'patient/document.pdf' }, error: null }), insert: vi.fn().mockResolvedValue({ error: null }) };
    mocks.db = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'assistant' } } }) }, from: vi.fn().mockReturnValue(query), rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    mocks.sign.mockResolvedValue('https://qa.example/document');
  });
  const request = () => POST(new Request('http://localhost/api', { method: 'POST' }), { params: Promise.resolve({ patientId: 'patient', documentId: 'document' }) });

  it('denies anonymous before reading a document', async () => {
    mocks.db.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await request()).status).toBe(401);
    expect(mocks.db.from).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('cannot sign an RLS-hidden or unrelated document', async () => {
    query.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    expect((await request()).status).toBe(404);
    expect(query.eq).toHaveBeenCalledWith('id', 'document');
    expect(query.eq).toHaveBeenCalledWith('patient_id', 'patient');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('requires download permission as well as document visibility', async () => {
    mocks.db.rpc.mockResolvedValue({ data: false });
    expect((await request()).status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('signs only the authorized object with a short lifetime', async () => {
    expect((await request()).status).toBe(200);
    expect(mocks.sign).toHaveBeenCalledWith('patient/document.pdf', 120);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ performed_by: 'assistant', patient_id: 'patient', document_id: 'document' }));
  });
  it('does not expose raw storage errors', async () => {
    mocks.sign.mockRejectedValue(new Error('raw SQL private data'));
    const result = await request();
    expect(result.status).toBe(400);
    expect(await result.text()).not.toContain('raw SQL');
  });
});
