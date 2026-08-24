'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SignOutButton } from '@/components/sign-out-button';
import { ModuleIcon } from '@/components/module-icon';
import { activeNavigationHref, sectionNavigation, type NavigationGroup } from '@/lib/permission-access';

export function PermissionSidebar({ groups, name, subtitle, profileHref }: { groups: readonly NavigationGroup[]; name: string; subtitle: string; profileHref: string }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const storageKey = useMemo(() => `bsmile-sidebar-scroll:${profileHref}`, [profileHref]);
  const collapsedStorageKey = useMemo(() => `bsmile-sidebar-collapsed:${profileHref}`, [profileHref]);
  const activeHref = activeNavigationHref(pathname, groups);
  const sections = useMemo(() => sectionNavigation(groups), [groups]);
  const activeSection = useMemo(() => sections.find((section) => section.links.some((link) => link.href === activeHref))?.title, [activeHref, sections]);
  const [sectionState, setSectionState] = useState<{ pathname: string; section: string | null }>(() => ({ pathname, section: activeSection || null }));
  // A route change always takes precedence over a previous manual toggle.
  // This avoids an effect-driven state update while keeping direct loads,
  // back/forward, and card navigation open on the active section.
  const openSection = sectionState.pathname === pathname ? sectionState.section : activeSection || null;

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

  useEffect(() => {
    const timer = window.setTimeout(() => setDesktopCollapsed(localStorage.getItem(collapsedStorageKey) === '1'), 0);
    return () => window.clearTimeout(timer);
  }, [collapsedStorageKey]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  const toggleDesktop = () => setDesktopCollapsed((current) => {
    localStorage.setItem(collapsedStorageKey, current ? '0' : '1');
    return !current;
  });

  const renderSidebar = (drawer = false) => { const collapsed = desktopCollapsed && !drawer; return <aside className={`app-sidebar${collapsed ? ' sidebar-collapsed' : ''}`} aria-label="Primary navigation">
    <div className="brand"><img src="/images/bsmile-logo.png" alt="BSmile" />{drawer ? <button className="sidebar-drawer-close" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>×</button> : <button className="sidebar-collapse-button" type="button" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed} title={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={toggleDesktop}>{collapsed ? '›' : '‹'}</button>}</div>
    <nav ref={drawer ? undefined : navRef} className="section-navigation">{sections.map((section) => { const isOpen = !collapsed && openSection === section.title; const containsActive = activeSection === section.title; return <section className={`nav-section${isOpen ? ' is-open' : ''}${containsActive ? ' contains-active' : ''}`} key={section.title}>
      <button className="nav-section-trigger" type="button" aria-expanded={isOpen} onClick={() => !collapsed && setSectionState({ pathname, section: openSection === section.title ? null : section.title })} title={collapsed ? section.title : undefined} aria-label={collapsed ? section.title : undefined}><ModuleIcon label={section.title} /><span className="nav-section-label">{section.title}</span><span className="nav-section-chevron" aria-hidden="true">⌄</span></button>
      {!collapsed && isOpen && <div className="nav-card-grid">{section.links.map((link) => { const active = activeHref === link.href; return <Link className={`nav-card${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} href={link.href} key={link.href} onClick={() => setMobileOpen(false)}><ModuleIcon label={link.label} /><span>{link.label}</span></Link>; })}</div>}
    </section>; })}</nav>
    <div className="sidebar-footer"><Link className="sidebar-user" href={profileHref} aria-label="My Profile" title={collapsed ? 'My Profile' : undefined} onClick={() => setMobileOpen(false)}><ModuleIcon label="My Profile" className="sidebar-profile-icon" /><span className="sidebar-user-copy"><b>{name}</b><small>{subtitle}</small></span></Link><SignOutButton /></div>
  </aside>; };

  return <>
    <button className="mobile-menu-button" type="button" aria-label="Open navigation" title="Open navigation" aria-expanded={mobileOpen} aria-controls="workspace-sidebar-drawer" onClick={() => setMobileOpen(true)}><span aria-hidden="true">☰</span></button>
    {renderSidebar()}
    {mobileOpen && <div className="sidebar-drawer" id="workspace-sidebar-drawer" role="dialog" aria-modal="true">
      <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      {renderSidebar(true)}
    </div>}
  </>;
}
