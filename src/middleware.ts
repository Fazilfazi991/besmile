import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminRouteRequirement, employeeRouteRequirement, isManagementRole, isSecurityAdministratorRole, workspaceLandingPath } from '@/lib/permission-access';

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
  const protectedPath = path.startsWith('/employee') || path.startsWith('/admin');

  if (protectedPath && !user) return NextResponse.redirect(new URL('/sign-in', request.url));

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
    if (!profile || profile.status !== 'active') return NextResponse.redirect(new URL('/sign-in?inactive=1', request.url));
    const isSuperAdmin = profile.role === 'super_admin';
    const isManagement = isManagementRole(profile.role);
    const hasAnyPermission = async (permissions: readonly string[]) => {
      const checks = await Promise.all(permissions.map((permission) => supabase.rpc('has_permission', { permission_code: permission })));
      return checks.some((check) => check.data === true);
    };
    const employeeLandingPath = async () => {
      for (const candidate of ['/employee/dashboard', '/employee/patients', '/employee/crm', '/employee/announcements', '/employee/attendance', '/employee/leaves', '/employee/tasks', '/employee/documents', '/employee/chat']) {
        const requirement = employeeRouteRequirement(candidate);
        if (!requirement || await hasAnyPermission(requirement.anyOf)) return candidate;
      }
      return '/employee/profile';
    };
    if (path === '/') return NextResponse.redirect(new URL(isSuperAdmin || isManagement ? workspaceLandingPath(profile.role) : await employeeLandingPath(), request.url));
    if ((isSuperAdmin || isManagement) && path.startsWith('/employee')) return NextResponse.redirect(new URL('/admin', request.url));
    if (path === '/employee') return NextResponse.redirect(new URL(await employeeLandingPath(), request.url));
    if (path.startsWith('/admin')) {
      if (path.startsWith('/admin/access') && !isSecurityAdministratorRole(profile.role)) return NextResponse.redirect(new URL('/unauthorized', request.url));
      const requirement = adminRouteRequirement(path);
      if (!await hasAnyPermission(requirement.anyOf)) return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
    if (path.startsWith('/employee')) {
      const requirement = employeeRouteRequirement(path);
      if (requirement && !await hasAnyPermission(requirement.anyOf)) return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  if (path === '/') return NextResponse.redirect(new URL('/sign-in', request.url));
  return response;
}

export const config = { matcher: ['/', '/employee/:path*', '/admin/:path*'] };
