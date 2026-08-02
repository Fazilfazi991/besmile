import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('sign-in landing', () => {
  it('lets middleware choose the first authorized workspace', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/sign-in/page.tsx'), 'utf8');
    expect(source).toContain("window.location.assign('/')");
    expect(source).not.toContain("window.location.assign('/employee/dashboard')");
  });
});
