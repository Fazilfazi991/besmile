import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminRouteRequirement, employeeRouteRequirement, isManagementRole, isSecurityAdministratorRole, workspaceLandingPath } from '@/lib/permission-access';
import { authorizationRead, AuthorizationUnavailable, ACCESS_UNAVAILABLE_MESSAGE } from '@/lib/authorization-transport';

function redirectWithCookies(request: NextRequest, response: NextResponse, path: string) {
  const redirectResponse = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  try { return await authorizeRequest(request, response); }
  catch (error) {
    if (!(error instanceof AuthorizationUnavailable)) throw error;
    // No protected document is rendered and no denial is fabricated.
    const unavailable = new NextResponse(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access check unavailable</title></head><body><main><h1>Access check temporarily unavailable</h1><p>${ACCESS_UNAVAILABLE_MESSAGE}</p><a href="">Try again</a></main></body></html>`, {
      status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '1' },
    });
    response.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
    return unavailable;
  }
}

async function authorizeRequest(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => items.forEach((item) => response.cookies.set(item.name, item.value, item.options)),
      },
    },
  );
  const { data: { user } } = await authorizationRead(() => supabase.auth.getUser(), 'middleware.session', true);
  const path = request.nextUrl.pathname;
  const protectedPath = path.startsWith('/employee') || path.startsWith('/admin') || path.startsWith('/clinician');

  if (protectedPath && !user) return redirectWithCookies(request, response, '/sign-in');

  if (user) {
    const { data: profile } = await authorizationRead(signal => supabase.from('profiles').select('role,status,is_employee').eq('id', user.id).abortSignal(signal).maybeSingle(), 'middleware.profile');
    if (!profile) return redirectWithCookies(request, response, '/unauthorized');
    if (profile.status === 'inactive' || profile.status === 'terminated') return redirectWithCookies(request, response, '/sign-in?inactive=1');
    const isSuperAdmin = profile.role === 'super_admin';
    const isManagement = isManagementRole(profile.role);
    const isOutsourcedClinician = profile.is_employee === false;
    const hasAnyPermission = async (permissions: readonly string[]) => {
      const checks = await Promise.all(permissions.map((permission) => authorizationRead(signal => supabase.rpc('has_permission', { permission_code: permission }).abortSignal(signal), 'middleware.permission')));
      if (checks.some(check => typeof check.data !== 'boolean')) throw new AuthorizationUnavailable();
      return checks.some((check) => check.data === true);
    };
    const employeeLandingPath = async () => {
      for (const candidate of ['/employee/dashboard', '/employee/patients', '/employee/crm', '/employee/announcements', '/employee/attendance', '/employee/leaves', '/employee/tasks', '/employee/documents', '/employee/chat']) {
        const requirement = employeeRouteRequirement(candidate);
        if (!requirement || await hasAnyPermission(requirement.anyOf || [])) return candidate;
      }
      return '/employee/profile';
    };
    if (path === '/') return redirectWithCookies(request, response, isOutsourcedClinician ? '/clinician/schedule' : isSuperAdmin || isManagement ? workspaceLandingPath(profile.role) : await employeeLandingPath());
    if (isOutsourcedClinician && (path.startsWith('/employee') || path.startsWith('/admin'))) return redirectWithCookies(request, response, '/clinician/schedule');
    if (!isOutsourcedClinician && path.startsWith('/clinician')) return redirectWithCookies(request, response, isSuperAdmin || isManagement ? '/admin' : await employeeLandingPath());
    if (path === '/clinician') return redirectWithCookies(request, response, '/clinician/schedule');
    if ((isSuperAdmin || isManagement) && path.startsWith('/employee')) return redirectWithCookies(request, response, '/admin');
    if (path === '/employee') return redirectWithCookies(request, response, await employeeLandingPath());
    if (path.startsWith('/admin')) {
      if (!isSuperAdmin && !isManagement && !await hasAnyPermission(['admin.shell'])) return redirectWithCookies(request, response, '/unauthorized');
      if (path.startsWith('/admin/access') && !isSecurityAdministratorRole(profile.role)) return redirectWithCookies(request, response, '/unauthorized');
      const requirement = adminRouteRequirement(path);
      if (!await hasAnyPermission(requirement.anyOf || [])) return redirectWithCookies(request, response, '/unauthorized');
    }
    if (path.startsWith('/employee')) {
      const requirement = employeeRouteRequirement(path);
      if (requirement && !await hasAnyPermission(requirement.anyOf || [])) return redirectWithCookies(request, response, '/unauthorized');
    }
  }

  if (path === '/') return redirectWithCookies(request, response, '/sign-in');
  return response;
}

export const config = { matcher: ['/', '/employee/:path*', '/admin/:path*', '/clinician/:path*'] };
