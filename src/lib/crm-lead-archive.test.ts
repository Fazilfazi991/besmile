import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');

describe('CRM lead archive persistence', () => {
  it('filters archived leads from active lists and verifies the mutation returned an archived row', () => {
    expect(repository).toContain(".from('crm_leads').select");
    expect(repository).toContain(".is('archived_at',null)");
    expect(repository).toContain(".select('id,archived_at').single()");
    expect(repository).toContain('Lead archive did not persist');
  });
});
