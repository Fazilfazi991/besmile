import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const page = source('src/app/admin/employees/page.tsx');
const repository = source('src/lib/admin-repository.ts');
const profilePolicy = source('supabase/migrations/0077_administration_admin_permission_bundle.sql');

describe('employee directory search autocomplete', () => {
  it('debounces a bounded server-side search and handles short and empty terms', () => {
    expect(page).toContain('normalizedEmployeeSearch(query)');
    expect(page).toContain('if (term.length < 2) return');
    expect(page).toContain('window.setTimeout(async () =>');
    expect(page).toContain('}, 250)');
    expect(page).toContain("adminRepository.employees(term, 0, workforceView === 'removed' ? 30 : 8");
    expect(page).toContain('No matching employees.');
  });

  it('provides accessible mouse and keyboard selection', () => {
    for (const marker of [
      'role="combobox"',
      'aria-autocomplete="list"',
      'role="listbox"',
      'role="option"',
      "event.key === 'ArrowDown'",
      "event.key === 'ArrowUp'",
      "event.key === 'Enter'",
      "event.key === 'Escape'",
      'router.push(`/admin/employees/${employee.id}`)',
    ]) expect(page).toContain(marker);
  });

  it('reuses the RLS-bound employee repository without broadening profile access', () => {
    expect(repository).toContain(".from('profiles')");
    expect(repository).toContain(".eq('is_employee',true)");
    expect(repository).toContain(".neq('role','director')");
    expect(repository).toContain('full_name.ilike.%${query}%');
    expect(profilePolicy).toContain("public.has_permission('employees.view')");
    expect(page).not.toMatch(/service[_-]?role/i);
    expect(page).toContain('Employee suggestions are temporarily unavailable.');
  });
});
