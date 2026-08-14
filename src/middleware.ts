import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminRouteRequirement, employeeRouteRequirement, isManagementRole, isSecurityAdministratorRole, workspaceLandingPath } from '@/lib/permission-access';

function redirectWithCookies(request: NextRequest, response: NextResponse, path: string) {
  const redirectResponse = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
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
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedPath = path.startsWith('/employee') || path.startsWith('/admin') || path.startsWith('/clinician') || path === '/change-password';

  if (protectedPath && !user) return redirectWithCookies(request, response, '/sign-in');

  if (user) {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role,status,is_employee,must_change_password').eq('id', user.id).maybeSingle();
    if (profileError) {
      console.warn('Middleware profile lookup failed', { path, userId: user.id, code: profileError.code });
      return response;
    }
    if (!profile) return redirectWithCookies(request, response, '/unauthorized');
    if (profile.status === 'inactive' || profile.status === 'terminated') return redirectWithCookies(request, response, '/sign-in?inactive=1');
    if (profile.must_change_password && path !== '/change-password') return redirectWithCookies(request, response, '/change-password');
    const isSuperAdmin = profile.role === 'super_admin';
    const isManagement = isManagementRole(profile.role);
    const isOutsourcedClinician = profile.is_employee === false;
    const hasAnyPermission = async (permissions: readonly string[]) => {
      const checks = await Promise.all(permissions.map((permission) => supabase.rpc('has_permission', { permission_code: permission })));
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

export const config = { matcher: ['/', '/employee/:path*', '/admin/:path*', '/clinician/:path*', '/change-password'] };
