import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function requiredAdminPermission(path: string) {
  if (path === '/admin/tasks') return 'tasks.assign';
  if (path === '/admin/task-access') return 'tasks.manage_access';
  if (path === '/admin/documents') return 'documents.manage';
  if (path === '/admin/announcements') return 'announcements.manage';
  if (path === '/admin/notifications') return 'notifications.view';
  if (path === '/admin/finance/invoices/new') return 'invoices.manage';
  if (path.startsWith('/admin/finance/invoices')) return 'invoices.view';
  if (path === '/admin/finance/payroll/settings') return 'payroll.manage';
  if (path.startsWith('/admin/finance/payroll')) return 'payroll.view';
  if (path.startsWith('/admin/finance/reports')) return 'reports.view';
  if (path.startsWith('/admin/finance')) return 'finance.view';
  if (path === '/admin/access') return 'roles.manage';
  if (path.startsWith('/admin/crm/import')) return 'crm.import';
  if (path.startsWith('/admin/crm')) return 'crm.manage_all';
  if (path.startsWith('/admin/employees')) return 'employees.view';
  return 'admin.access';
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
  const protectedPath = path.startsWith('/employee') || path.startsWith('/admin');

  if (protectedPath && !user) return NextResponse.redirect(new URL('/sign-in', request.url));

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
    if (!profile || profile.status !== 'active') return NextResponse.redirect(new URL('/sign-in?inactive=1', request.url));
    const isManagement = ['super_admin', 'chairman', 'director', 'general_manager'].includes(profile.role);
    if (path === '/') return NextResponse.redirect(new URL(isManagement ? '/admin' : '/employee/dashboard', request.url));
    if (path === '/employee') return NextResponse.redirect(new URL('/employee/dashboard', request.url));
    if (path.startsWith('/admin')) {
      const permission = requiredAdminPermission(path);
      const { data: allowed } = await supabase.rpc('has_permission', { permission_code: permission });
      if (!allowed) return NextResponse.redirect(new URL('/employee/dashboard', request.url));
    }
  }

  if (path === '/') return NextResponse.redirect(new URL('/sign-in', request.url));
  return response;
}

export const config = { matcher: ['/', '/employee/:path*', '/admin/:path*'] };
