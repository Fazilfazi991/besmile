import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('assigned patient routes', () => {
  it('ships the intern landing route and its scoped detail route', () => {
    const listRoute = resolve(process.cwd(), 'src/app/employee/patients/page.tsx');
    const detailRoute = resolve(process.cwd(), 'src/app/employee/patients/[patientId]/page.tsx');
    expect(existsSync(listRoute)).toBe(true);
    expect(existsSync(detailRoute)).toBe(true);
    expect(readFileSync(listRoute, 'utf8')).toContain('basePath="/employee/patients"');
    expect(readFileSync(listRoute, 'utf8')).toContain('canCreate={false}');
  });
});
