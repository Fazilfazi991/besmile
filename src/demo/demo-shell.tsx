import { MobileNavigationProvider, MobileNavigationTrigger } from '@/components/mobile-navigation';
import { PageBackButton } from '@/components/page-back-button';
import { PermissionSidebar } from '@/components/permission-sidebar';
import { ThemeModeSwitcher } from '@/components/theme-mode-switcher';
import { TopbarProfileLink } from '@/components/topbar-profile-link';
import { DemoModeBanner } from '@/components/demo-mode-banner';
const demoGroups = [{ title: 'DEMO GUIDE', links: [{ label: 'Dashboard', href: '/employee/dashboard' }, { label: 'Clients', href: '/employee/patients' }, { label: 'Clinical workflow', href: '/clinician/schedule' }, { label: 'Notifications', href: '/employee/notifications' }, { label: 'Reporting', href: '/admin/reports' }] }];

export function DemoShell({ children }: { children: React.ReactNode }) {
  return <MobileNavigationProvider><div className="app-shell employee-shell"><PermissionSidebar groups={demoGroups} name="Alex Morgan" subtitle="Demo Administrator" profileHref="/employee/dashboard" /><main className="app-main"><header className="app-topbar"><div className="topbar-mode"><MobileNavigationTrigger /><ThemeModeSwitcher /></div><div className="text-sm text-slate-500">Public portfolio workspace</div><TopbarProfileLink href="/employee/dashboard" name="Alex Morgan" subtitle="Demo Administrator" /></header><DemoModeBanner /><div className="app-content"><PageBackButton />{children}</div></main></div></MobileNavigationProvider>;
}
