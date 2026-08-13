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

    expect(repository).toMatch(/\.select\(["']status,document_submissions\(storage_path\)["']\)/);
    expect(repository).toContain('previousStatus');
    expect(repository).toMatch(/storage\s*\.from\(["']employee-documents["']\)\s*\.remove\(\[path\]\)/);
    expect(repository).toMatch(/update\(\{\s*status:\s*previousStatus\s*\}\)/);
    expect(repository).toMatch(/file_size:\s*file\.size/);
    expect(repository).toContain('previousPath');
    expect(repository).toContain('previousPath !== path');

    const upload = repository.indexOf('.upload(path, file)');
    const metadata = repository.indexOf('.from("document_submissions").upsert', upload);
    const cleanup = repository.indexOf('.remove([path])', metadata);
    const statusRestore = repository.indexOf('status: previousStatus', cleanup);
    expect(upload).toBeGreaterThan(-1);
    expect(metadata).toBeGreaterThan(upload);
    expect(cleanup).toBeGreaterThan(metadata);
    expect(statusRestore).toBeGreaterThan(cleanup);
  });

  it('allows rejected submissions to be corrected and removes the superseded object', () => {
    const repository = readFileSync(resolve(process.cwd(), 'src/lib/employee-repository.ts'), 'utf8');
    const page = readFileSync(resolve(process.cwd(), 'src/app/employee/documents/page.tsx'), 'utf8');
    expect(repository).toContain('document_submissions(storage_path)');
    expect(repository).toContain('remove([previousPath])');
    expect(page).toContain("request.status === 'rejected'");
    expect(page).toContain("'Replace document'");
  });
});
