import { MobileNavigationProvider, MobileNavigationTrigger } from '@/components/mobile-navigation';
import { PageBackButton } from '@/components/page-back-button';
import { PermissionSidebar } from '@/components/permission-sidebar';
import { ThemeModeSwitcher } from '@/components/theme-mode-switcher';
import { TopbarProfileLink } from '@/components/topbar-profile-link';
import { DemoModeBanner } from '@/components/demo-mode-banner';
import { adminNavigation, type NavigationGroup } from '@/lib/permission-access';
import { demoDirectorPermissions } from './demo-director-data';
import { filterNavigation } from '@/lib/permission-access';

const demoGroups: NavigationGroup[] = filterNavigation(adminNavigation, demoDirectorPermissions);

export function DemoShell({ children }: { children: React.ReactNode }) {
  return <MobileNavigationProvider><div className="app-shell employee-shell"><PermissionSidebar groups={demoGroups} name="Alex Morgan" subtitle="Director" profileHref="/admin/profile" /><main className="app-main"><header className="app-topbar"><div className="topbar-mode"><MobileNavigationTrigger /><ThemeModeSwitcher /></div><div className="text-sm text-slate-500">Director workspace</div><TopbarProfileLink href="/admin/profile" name="Alex Morgan" subtitle="Director" /></header><DemoModeBanner /><div className="app-content"><PageBackButton />{children}</div></main></div></MobileNavigationProvider>;
}
