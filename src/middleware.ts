import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { adminRouteRequirement, employeeRouteRequirement, isManagementRole, isSecurityAdministratorRole, workspaceLandingPath } from '@/lib/permission-access';
import { authorizationRead, AuthorizationUnavailable, ACCESS_UNAVAILABLE_MESSAGE } from '@/lib/authorization-transport';
import { grantedPermissions } from '@/lib/granted-permissions';

const employeeLandingCandidates = ['/employee/dashboard', '/employee/patients', '/employee/crm', '/employee/announcements', '/employee/attendance', '/employee/leaves', '/employee/tasks', '/employee/documents', '/employee/chat'];

function redirectWithCookies(request: NextRequest, response: NextResponse, path: string) {
  const redirectResponse = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  // Vercel's Preview toolbar probes protected routes with same-origin OPTIONS
  // requests. Answer the preflight without resolving a session or rendering any
  // protected content so the probe cannot surface as a browser console error.
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
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
  let sessionSignal: AbortSignal | undefined;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // getUser has no AbortSignal parameter. Cancel its actual fetch when the
      // bounded authorization read expires, before starting another attempt.
      global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || sessionSignal, cache: 'no-store' }) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => items.forEach((item) => response.cookies.set(item.name, item.value, item.options)),
      },
    },
  );
  const { data: { user } } = await authorizationRead(async signal => {
    sessionSignal = signal;
    try { return await supabase.auth.getUser(); }
    finally { if (sessionSignal === signal) sessionSignal = undefined; }
  }, 'middleware.session', true);
  const path = request.nextUrl.pathname;
  const protectedPath = path.startsWith('/employee') || path.startsWith('/admin') || path.startsWith('/clinician');

  if (protectedPath && !user) return redirectWithCookies(request, response, '/sign-in');

  if (user) {
    const { data: profile } = await authorizationRead(signal => supabase.from('profiles').select('role,status,is_employee,onboarding_required').eq('id', user.id).abortSignal(signal).maybeSingle(), 'middleware.profile');
    if (!profile) return redirectWithCookies(request, response, '/unauthorized');
    if (profile.status === 'inactive' || profile.status === 'terminated') return redirectWithCookies(request, response, '/sign-in?inactive=1');
    if (profile.onboarding_required) {
      if (path === '/onboarding/password') return response;
      return redirectWithCookies(request, response, '/onboarding/password');
    }
    const isSuperAdmin = profile.role === 'super_admin';
    const isManagement = isManagementRole(profile.role);
    const isOutsourcedClinician = profile.is_employee === false;
    const requiredCodes = new Set((path.startsWith('/admin') ? adminRouteRequirement(path) : employeeRouteRequirement(path))?.anyOf || []);
    if (path.startsWith('/admin')) {
      requiredCodes.add('admin.shell');
      if (path.startsWith('/admin/daily-work')) requiredCodes.add('daily_work.review_department');
      if (path.startsWith('/admin/employees') && !path.startsWith('/admin/employees/new')) {
        requiredCodes.add('employees.identity.view'); requiredCodes.add('employees.identity.edit');
      }
      if (path.startsWith('/admin/online-clinicians')) requiredCodes.add('outsourced_clinicians.manage');
      if (path.startsWith('/admin/clinical-followups')) requiredCodes.add('clinical_followups.view_operational');
    }
    if (path === '/' || path === '/employee' || path === '/onboarding/password' || path.startsWith('/clinician')) {
      employeeLandingCandidates.forEach(candidate => employeeRouteRequirement(candidate)?.anyOf?.forEach(code => requiredCodes.add(code)));
    }
    // One request-scoped batch; decisions still use live has_permission through
    // the existing RLS-bound granted_permissions function.
    let allowedPromise: Promise<Set<string>> | undefined;
    const hasAnyPermission = async (permissions: readonly string[]) => {
      allowedPromise ||= grantedPermissions(supabase, [...requiredCodes]);
      const allowed = await allowedPromise;
      return permissions.some(permission => allowed.has(permission));
    };
    const employeeLandingPath = async () => {
      for (const candidate of employeeLandingCandidates) {
        const requirement = employeeRouteRequirement(candidate);
        if (!requirement || await hasAnyPermission(requirement.anyOf || [])) return candidate;
      }
      return '/employee/profile';
    };
    if (path === '/onboarding/password') return redirectWithCookies(request, response, isOutsourcedClinician ? '/clinician/schedule' : isSuperAdmin || isManagement ? workspaceLandingPath(profile.role) : await employeeLandingPath());
    if (path === '/') return redirectWithCookies(request, response, isOutsourcedClinician ? '/clinician/schedule' : isSuperAdmin || isManagement ? workspaceLandingPath(profile.role) : await employeeLandingPath());
    if (isOutsourcedClinician && (path.startsWith('/employee') || path.startsWith('/admin'))) return redirectWithCookies(request, response, '/clinician/schedule');
    if (!isOutsourcedClinician && path.startsWith('/clinician')) return redirectWithCookies(request, response, isSuperAdmin || isManagement ? '/admin' : await employeeLandingPath());
    if (path === '/clinician') return redirectWithCookies(request, response, '/clinician/schedule');
    if ((isSuperAdmin || isManagement) && path.startsWith('/employee')) return redirectWithCookies(request, response, '/admin');
    if (path === '/employee') return redirectWithCookies(request, response, await employeeLandingPath());
    if (path.startsWith('/admin')) {
      const isDepartmentDailyWorkReviewer = path.startsWith('/admin/daily-work')
        && await hasAnyPermission(['daily_work.review_department']);
      const isScopedEditor = (path.startsWith('/admin/employees') && !path.startsWith('/admin/employees/new') && await hasAnyPermission(['employees.identity.view','employees.identity.edit'])) || (path.startsWith('/admin/online-clinicians') && await hasAnyPermission(['outsourced_clinicians.manage'])) || (path.startsWith('/admin/clinical-followups') && await hasAnyPermission(['clinical_followups.view_operational']));
      if (!isSuperAdmin && !isManagement && !isScopedEditor && !isDepartmentDailyWorkReviewer && !await hasAnyPermission(['admin.shell'])) return redirectWithCookies(request, response, '/unauthorized');
      if (path.startsWith('/admin/access') && !isSecurityAdministratorRole(profile.role)) return redirectWithCookies(request, response, '/unauthorized');
      const requirement = adminRouteRequirement(path);
      if (requirement && !await hasAnyPermission(requirement.anyOf || [])) return redirectWithCookies(request, response, '/unauthorized');
    }
    if (path.startsWith('/employee')) {
      const requirement = employeeRouteRequirement(path);
      if (requirement && !await hasAnyPermission(requirement.anyOf || [])) return redirectWithCookies(request, response, '/unauthorized');
    }
  }

  if (path === '/') return redirectWithCookies(request, response, '/sign-in');
  return response;
}

// Production Supabase is in ap-northeast-1 (Tokyo). Avoid intercontinental
// authorization round trips while keeping all existing checks fail closed.
export const config = { regions: ['hnd1'], matcher: ['/', '/employee/:path*', '/admin/:path*', '/clinician/:path*', '/onboarding/:path*'] };
