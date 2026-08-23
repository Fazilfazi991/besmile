import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/admin/crm/leads/[id]/page.tsx', import.meta.url), 'utf8');

describe('CRM lead archive persistence', () => {
  it('filters archived leads from active lists and verifies the mutation returned an archived row', () => {
    expect(repository).toContain(".from('crm_leads').select");
    expect(repository).toContain(".is('archived_at',null)");
    expect(repository).toContain(".select('id,archived_at').single()");
    expect(repository).toContain('Lead archive did not persist');
  });
  it('uses the shared asynchronous confirmation dialog instead of native confirmation', () => {
    expect(page).toContain('ConfirmationDialog');
    expect(page).toContain('Archive lead?');
    expect(page).toContain('archiveBusy');
    expect(page).toContain('archiveError');
    expect(page).not.toContain('window.confirm');
  });
});
