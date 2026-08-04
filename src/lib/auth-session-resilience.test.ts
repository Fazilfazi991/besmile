import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const middleware = readFileSync(resolve(process.cwd(), 'src/middleware.ts'), 'utf8');
const serverClient = readFileSync(resolve(process.cwd(), 'src/lib/supabase-server.ts'), 'utf8');
const adminLayout = readFileSync(resolve(process.cwd(), 'src/app/admin/layout.tsx'), 'utf8');
const employeeLayout = readFileSync(resolve(process.cwd(), 'src/app/employee/layout.tsx'), 'utf8');

describe('auth session resilience', () => {
  it('preserves refreshed Supabase cookies across middleware redirects', () => {
    expect(middleware).toContain('redirectWithCookies');
    expect(middleware).toContain('response.cookies.getAll().forEach');
    expect(middleware).toContain('redirectResponse.cookies.set(cookie)');
    expect(middleware).not.toContain("return NextResponse.redirect(new URL('/unauthorized', request.url))");
  });

  it('does not treat temporary profile lookup errors as sign-out events', () => {
    expect(middleware).toContain('profileError');
    expect(middleware).toContain('return response');
    expect(adminLayout).toContain('profileError');
    expect(adminLayout).toContain("redirect('/unauthorized')");
    expect(employeeLayout).toContain('profileError');
    expect(employeeLayout).toContain("redirect('/unauthorized')");
    expect(adminLayout).not.toContain("if (!profile || profile.status !== 'active') redirect('/sign-in?inactive=1')");
    expect(employeeLayout).not.toContain("if (!profile || profile.status !== 'active') redirect('/sign-in?inactive=1')");
  });

  it('lets server actions persist refreshed auth cookies when Next permits it', () => {
    expect(serverClient).toContain('setAll: (items)');
    expect(serverClient).toContain('store.set(name, value, options)');
    expect(serverClient).toContain('Server Components cannot set cookies');
  });
});
