import { existsSync, readFileSync } from 'node:fs'; import { resolve } from 'node:path'; import { describe, expect, it } from 'vitest';
const register = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/bsm-regression-register.json'), 'utf8')) as Array<{ id: string; guard: string }>;
describe('historic client regression register', () => {
  it('covers BSM-01 through BSM-17 and all post-release patches', () => { expect(register.map(item => item.id)).toEqual([...Array.from({ length: 17 }, (_, index) => `BSM-${String(index + 1).padStart(2, '0')}`), 'PATCH-1', 'PATCH-2', 'PATCH-3']); });
  it.each(register)('$id has a committed automated guard', ({ guard }) => expect(existsSync(resolve(process.cwd(), guard))).toBe(true));
});
