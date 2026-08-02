import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../app/admin/employees/[id]/page.tsx', import.meta.url), 'utf8');

describe('employee edit modal layout', () => {
  it('constrains the dialog to the viewport and provides a scrollable body', () => {
    expect(page).toContain('max-h-[calc(100dvh-1.5rem)]');
    expect(page).toContain('sm:max-h-[90dvh]');
    expect(page).toContain('min-h-0 flex-1 overflow-y-auto overscroll-contain');
  });

  it('keeps controls outside the scrolling body and prevents horizontal layout pressure', () => {
    expect(page).toContain('flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden');
    expect(page).toContain('flex shrink-0 flex-wrap justify-end gap-2 border-t');
    expect(page).toContain('grid gap-3 md:grid-cols-2');
  });

  it('exposes an accessible dialog with close, Escape, and keyboard focus containment', () => {
    expect(page).toContain('role="dialog" aria-modal="true" aria-labelledby="edit-employee-title"');
    expect(page).toContain('aria-label="Close edit employee"');
    expect(page).toContain("event.key === 'Escape'");
    expect(page).toContain("event.key !== 'Tab'");
  });

  it('serializes the actual form controls rather than stale local state', () => {
    expect(page).toContain('Object.fromEntries(new FormData(event.currentTarget))');
    expect(page).toContain('name={key}');
    expect(page).toContain('name="department_id"');
    expect(page).toContain('name="manager_id"');
    expect(page.indexOf('const payload = employeeEditPayload')).toBeLessThan(page.indexOf('setBusy(true); try { await adminRepository.updateEmployee(profile.id, payload'));
  });

  it('loads relation IDs required to preserve selected department and manager values', () => {
    const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
    expect(repository).toContain('avatar_url,department_id,manager_id');
    expect(page).toContain('department_id: profile.department_id ||');
    expect(page).toContain('manager_id: profile.manager_id ||');
  });
});
