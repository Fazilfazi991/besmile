import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../app/admin/tasks/page.tsx', import.meta.url), 'utf8');

describe('task form submission', () => {
  it('captures named form controls at submit time', () => {
    expect(page).toContain('const taskFormPayload = (form: HTMLFormElement)');
    expect(page).toContain('Object.fromEntries(new FormData(form))');
    expect(page).toContain('name="title"');
    expect(page).toContain('name="priority"');
    expect(page).toContain('name="description"');
    expect(page).toContain('name="due_date"');
    expect(page).toContain('if (!payload.due_date) return setError');
  });
});
