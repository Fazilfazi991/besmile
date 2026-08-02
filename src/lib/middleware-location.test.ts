import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Next middleware discovery', () => {
  it('keeps route authorization beside the src app tree', () => {
    expect(existsSync(resolve(process.cwd(), 'src/middleware.ts'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'middleware.ts'))).toBe(false);
  });
});
