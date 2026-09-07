import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const page = readFileSync('src/app/admin/tasks/page.tsx', 'utf8');
const hook = readFileSync('src/lib/use-auto-size-textareas.ts', 'utf8');
describe('task description auto sizing', () => {
  it('sizes create and edit description fields from controlled content', () => {
    expect(page).toContain('textarea[name="description"]');
    expect(page).toContain('form.description');
    expect(page).toContain('editing?.description');
    expect(hook).toContain('element.scrollHeight');
    expect(hook).toContain('Math.min(element.scrollHeight, 320)');
    expect(hook).toContain('overflowY');
  });
});
