import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
const from = vi.fn(() => ({ upload }));

vi.mock('./supabase', () => ({
  supabase: {
    storage: { from },
    from: vi.fn(() => ({
      update: vi.fn(),
      upsert: vi.fn(),
      insert: vi.fn(),
    })),
  },
}));

describe('employee document repository validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects admin empty files before Storage is called', async () => {
    const { adminRepository } = await import('./admin-repository');

    await expect(adminRepository.uploadCompanyDocument('manager-id', { name: 'empty.pdf', type: 'application/pdf', size: 0 } as File))
      .rejects.toThrow(/empty/i);

    expect(from).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects employee empty files before Storage or metadata writes are called', async () => {
    const { employeeRepository } = await import('./employee-repository');

    await expect(employeeRepository.submitRequestedDocument('employee-id', 'request-id', { name: 'empty.pdf', type: 'application/pdf', size: 0 } as File))
      .rejects.toThrow(/empty/i);

    expect(from).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects app-layer bypass attempts before Storage is called', async () => {
    const { adminRepository } = await import('./admin-repository');
    const attempts = [
      { name: 'empty.jpg', type: 'image/jpeg', size: 0 },
      { name: 'missing-mime.pdf', type: '', size: 100 },
      { name: 'plain.pdf', type: 'text/plain', size: 100 },
      { name: 'oversized.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 },
      { name: 'sample.exe.pdf', type: 'application/pdf', size: 100 },
    ];

    for (const file of attempts) {
      await expect(adminRepository.uploadCompanyDocument('manager-id', file as File)).rejects.toThrow();
    }

    expect(from).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('cleans uploaded employee-request objects and restores request status when metadata persistence fails', () => {
    const repository = readFileSync(resolve(process.cwd(), 'src/lib/employee-repository.ts'), 'utf8');

    expect(repository).toContain("select('status')");
    expect(repository).toContain('previousStatus');
    expect(repository).toContain("storage.from('employee-documents').remove([path])");
    expect(repository).toContain('update({status:previousStatus})');
    expect(repository).toContain('file_size:file.size');
  });
});
