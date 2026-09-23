import { beforeEach, describe, expect, it, vi } from 'vitest';
import { officialDocumentAccess } from './official-document-access';
import { officialDocumentTypes } from './official-document-types';
import { officialMomType } from './official-mom';

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/supabase-server', () => ({ serverSupabase: async () => state.db }));
import { POST } from '@/app/api/documents/official/upload/route';

let storage: any;
let insert: any;
function request(overrides: Record<string, string | File | undefined> = {}) {
  const file = overrides.file instanceof File ? overrides.file : new File(['%PDF-1.4 test'], 'minutes.pdf', { type: 'application/pdf' });
  storage.download.mockResolvedValue({ data: file, error: null });
  const fields = { documentType: officialMomType, title: 'Weekly meeting', storagePath: `company/uploader/mom/20000000-0000-4000-8000-000000000001-${file.name}`, ...overrides };
  return new Request('http://localhost/api/documents/official/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
}
function permissions(codes: string[]) {
  state.db.rpc = vi.fn(async (_: string, { permission_code }: { permission_code: string }) => ({ data: codes.includes(permission_code) }));
}

beforeEach(() => {
  storage = { download: vi.fn(), remove: vi.fn(async () => ({ error: null })) };
  insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'saved' }, error: null }) }) }));
  const lookup: any = { eq: () => lookup, maybeSingle: async () => ({ data: null, error: null }) };
  state.db = { auth: { getUser: async () => ({ data: { user: { id: 'uploader' } } }) }, storage: { from: vi.fn(() => storage) }, from: vi.fn(() => ({ insert, select: () => lookup })) };
  permissions(['documents.official.generate']);
});

describe('MOM upload authorization and endpoint', () => {
  it.each(['documents.manage', 'documents.employee.manage', 'documents.official.generate'])('inherits %s without granting manager access', async code => {
    permissions([code]);
    const access = await officialDocumentAccess(state.db);
    expect(access.canUploadMom).toBe(true);
    expect(access.manager).toBe(code !== 'documents.official.generate');
    expect((await POST(request())).status).toBe(201);
  });
  it('rejects unauthenticated requests before parsing files', async () => {
    state.db.auth.getUser = async () => ({ data: { user: null } });
    expect((await POST(request())).status).toBe(401);
    expect(storage.download).not.toHaveBeenCalled();
  });
  it.each([{ codes: [] }, { codes: ['documents.employee.view'] }, { codes: ['documents.administration.manage'] }])('rejects unrelated permissions $codes', async ({ codes }) => {
    permissions(codes);
    expect((await POST(request())).status).toBe(403);
    expect(storage.download).not.toHaveBeenCalled();
  });
  it('fails closed when permission checks error', async () => {
    state.db.rpc = async () => ({ data: null, error: { message: 'offline' } });
    expect((await POST(request())).status).toBe(403);
  });
  it('does not add MOM to the generated PDF catalogue', () => {
    expect(officialDocumentTypes.map(type => type.key)).not.toContain(officialMomType);
  });
  it.each([
    { documentType: 'offer_letter' }, { title: '  ' }, { title: 'x'.repeat(141) },
    { file: new File(['x'], 'minutes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) },
    { file: new File([], 'minutes.pdf', { type: 'application/pdf' }) },
    { file: new File(['x'], 'minutes.png', { type: 'application/pdf' }) },
    { file: new File(['x'], 'minutes.exe.pdf', { type: 'application/pdf' }) },
    { file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'minutes.pdf', { type: 'application/pdf' }) },
  ])('rejects invalid payload before metadata insertion', async override => {
    expect((await POST(request(override))).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it.each([['pdf', 'application/pdf'], ['jpg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']])('preserves existing %s support', async (ext, mime) => {
    expect((await POST(request({ file: new File(['content'], `minutes.${ext}`, { type: mime }) }))).status).toBe(201);
  });
  it('ignores forged ownership/type/size metadata and reads the actual stored file', async () => {
    await POST(request({ uploaded_by: 'someone-else', source_type: 'official_generated', storage_path: 'outside', file_size: '9999' }));
    expect(insert.mock.calls[0][0]).toMatchObject({ uploaded_by: 'uploader', source_type: 'uploaded', document_type: officialMomType });
    expect(insert.mock.calls[0][0].file_size).toBe(13);
  });
  it('does not create metadata after Storage read failure', async () => {
    const req = request();
    storage.download.mockResolvedValue({ error: { message: 'failed' } });
    expect((await POST(req)).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it('reports metadata failure so the client can remove only its orphan upload', async () => {
    insert.mockReturnValue({ select: () => ({ single: async () => ({ error: { message: 'failed' } }) }) });
    expect((await POST(request())).status).toBe(400);
  });
  it.each(['company/other/mom/20000000-0000-4000-8000-000000000001-minutes.pdf', 'company/uploader/official/minutes.pdf'])('rejects unowned or general path %s', async storagePath => {
    expect((await POST(request({ storagePath }))).status).toBe(400);
    expect(storage.download).not.toHaveBeenCalled();
  });
  it('returns the existing MOM after a repeated finalize request', async () => {
    const lookup: any = { eq: () => lookup, maybeSingle: async () => ({ data: { id: 'existing' }, error: null }) };
    state.db.from = () => ({ insert, select: () => lookup });
    const response = await POST(request());
    expect(await response.json()).toEqual({ id: 'existing' });
    expect(insert).not.toHaveBeenCalled();
  });
});
