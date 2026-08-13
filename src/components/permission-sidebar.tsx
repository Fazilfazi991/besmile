'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SignOutButton } from '@/components/sign-out-button';
import { ModuleIcon } from '@/components/module-icon';
import type { NavigationGroup, NavigationLink } from '@/lib/permission-access';

function isActive(pathname: string, link: NavigationLink) {
  const candidates = [link.href, ...(link.activeHrefs || [])];
  return candidates.some((href) => pathname === href || (!link.exact && href !== '/admin' && pathname.startsWith(`${href}/`)));
}

export function PermissionSidebar({ groups, name, subtitle, profileHref }: { groups: readonly NavigationGroup[]; name: string; subtitle: string; profileHref: string }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const storageKey = useMemo(() => `bsmile-sidebar-scroll:${profileHref}`, [profileHref]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = Number(sessionStorage.getItem(storageKey) || 0);
    if (saved > 0) nav.scrollTop = saved;
    const save = () => sessionStorage.setItem(storageKey, String(nav.scrollTop));
    nav.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      nav.removeEventListener('scroll', save);
    };
  }, [storageKey]);

  const renderSidebar = (drawer = false) => <aside className="app-sidebar">
    <div className="brand"><img src="/images/bsmile-logo.png" alt="BSmile" /></div>
    <nav ref={drawer ? undefined : navRef}>{groups.map((group) => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.links.map((link) => <Link className={`nav-link${isActive(pathname, link) ? ' active' : ''}`} aria-current={isActive(pathname, link) ? 'page' : undefined} href={link.href} key={link.href} onClick={() => setMobileOpen(false)}><ModuleIcon label={link.label} />{link.label}</Link>)}</div>)}</nav>
    <div className="sidebar-footer"><Link className="sidebar-user" href={profileHref}><b>{name}</b><small>{subtitle}</small></Link><SignOutButton /></div>
  </aside>;

  return <>
    <button className="mobile-menu-button" type="button" aria-expanded={mobileOpen} aria-controls="workspace-sidebar-drawer" onClick={() => setMobileOpen(true)}>Menu</button>
    {renderSidebar()}
    {mobileOpen && <div className="sidebar-drawer" id="workspace-sidebar-drawer" role="dialog" aria-modal="true">
      <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      {renderSidebar(true)}
    </div>}
  </>;
}
