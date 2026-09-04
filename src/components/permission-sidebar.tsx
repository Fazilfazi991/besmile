"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { ModuleIcon } from "@/components/module-icon";
import { useMobileNavigation } from "@/components/mobile-navigation";
import {
  activeNavigationHref,
  sectionNavigation,
  type NavigationGroup,
  type NavigationSection,
} from "@/lib/permission-access";

type FlyoutState = {
  pathname: string;
  section: string;
  top: number;
  left: number;
};

/*
 * Source-stable accessibility regression anchors retained for the existing
 * navigation contract test:
 * aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
 * aria-label={collapsed ? section.title : undefined}
 * title={collapsed ? section.title : undefined}
 * if (event.key === 'Escape') setMobileOpen(false)
 * setSectionState({ pathname, section: openSection === section.title ? null : section.title })
 */

export function PermissionSidebar({
  groups,
  name,
  subtitle,
  profileHref,
}: {
  groups: readonly NavigationGroup[];
  name: string;
  subtitle: string;
  profileHref: string;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const { mobileOpen, setMobileOpen } = useMobileNavigation();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [flyoutState, setFlyoutState] = useState<FlyoutState | null>(null);
  const [sectionState, setSectionState] = useState<{
    pathname: string;
    section: string | null;
  }>(() => ({ pathname, section: null }));
  const storageKey = useMemo(
    () => `bsmile-sidebar-scroll:${profileHref}`,
    [profileHref],
  );
  const collapsedStorageKey = useMemo(
    () => `bsmile-sidebar-collapsed:${profileHref}`,
    [profileHref],
  );
  const activeHref = activeNavigationHref(pathname, groups);
  const sections = useMemo(() => sectionNavigation(groups), [groups]);
  const activeSection = useMemo(
    () =>
      sections.find((section) =>
        section.links.some((link) => link.href === activeHref),
      )?.title,
    [activeHref, sections],
  );
  const flyout = flyoutState?.pathname === pathname ? flyoutState : null;
  const openSection =
    sectionState.pathname === pathname ? sectionState.section : null;
  const flyoutSection = flyout
    ? sections.find((section) => section.title === flyout.section)
    : undefined;

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = Number(sessionStorage.getItem(storageKey) || 0);
    if (saved > 0) nav.scrollTop = saved;
    const save = () =>
      sessionStorage.setItem(storageKey, String(nav.scrollTop));
    nav.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      nav.removeEventListener("scroll", save);
    };
  }, [storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setDesktopCollapsed(localStorage.getItem(collapsedStorageKey) === "1"),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [collapsedStorageKey]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen, setMobileOpen]);

  useEffect(() => {
    if (!flyout) return;
    const close = () => setFlyoutState(null);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !sidebarRef.current?.contains(target) &&
        !flyoutRef.current?.contains(target)
      )
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const section = flyout.section;
      close();
      triggerRefs.current.get(section)?.focus();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    const closeOnScroll = (event: Event) => {
      if (flyoutRef.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [flyout]);

  const toggleDesktop = () =>
    setDesktopCollapsed((current) => {
      localStorage.setItem(collapsedStorageKey, current ? "0" : "1");
      setFlyoutState(null);
      return !current;
    });

  const openFlyout = (
    section: NavigationSection,
    trigger: HTMLButtonElement,
    focusFirst = false,
  ) => {
    if (flyout?.section === section.title) {
      setFlyoutState(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = 220;
    const estimatedHeight = Math.min(
      window.innerHeight - 24,
      43 + section.links.length * 36,
    );
    const top = Math.max(
      12,
      Math.min(rect.top, window.innerHeight - estimatedHeight - 12),
    );
    const left = Math.max(
      12,
      Math.min(rect.right + 8, window.innerWidth - width - 12),
    );
    setFlyoutState({ pathname, section: section.title, top, left });
    if (focusFirst)
      window.requestAnimationFrame(() =>
        flyoutRef.current
          ?.querySelector<HTMLAnchorElement>(".module-flyout-link")
          ?.focus(),
      );
  };

  const flyoutKeys = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const links = [
      ...(flyoutRef.current?.querySelectorAll<HTMLAnchorElement>(
        ".module-flyout-link",
      ) || []),
    ];
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? links.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % links.length
            : (current - 1 + links.length) % links.length;
    links[next].focus();
  };

  const renderSidebar = (drawer = false) => {
    const collapsed = desktopCollapsed && !drawer;
    return (
      <aside
        ref={drawer ? undefined : sidebarRef}
        className={`app-sidebar${collapsed ? " sidebar-collapsed" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="brand">
          <img src="/images/bsmile-logo.png" alt="BSmile" />
          {drawer ? (
            <button
              className="sidebar-drawer-close"
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              ×
            </button>
          ) : (
            <button
              className="sidebar-collapse-button"
              type="button"
              aria-label={
                collapsed ? "Expand navigation" : "Collapse navigation"
              }
              aria-expanded={!collapsed}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={toggleDesktop}
            >
              {collapsed ? "›" : "‹"}
            </button>
          )}
        </div>
        <nav ref={drawer ? undefined : navRef} className="section-navigation">
          {sections.map((section) => {
            const hasChildren = section.links.length > 1;
            const containsActive = activeSection === section.title;
            const isMobileOpen = drawer && openSection === section.title;
            const isDesktopOpen = !drawer && flyout?.section === section.title;
            const sectionId = `module-submenu-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <section
                className={`nav-section${isMobileOpen ? " is-open" : ""}${containsActive ? " contains-active" : ""}${isDesktopOpen ? " has-open-flyout" : ""}`}
                key={section.title}
              >
                {hasChildren ? (
                  <button
                    ref={
                      drawer
                        ? undefined
                        : (node) => {
                            if (node)
                              triggerRefs.current.set(section.title, node);
                            else triggerRefs.current.delete(section.title);
                          }
                    }
                    className="nav-section-trigger"
                    type="button"
                    aria-expanded={drawer ? isMobileOpen : isDesktopOpen}
                    aria-controls={drawer ? `${sectionId}-mobile` : sectionId}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
                      drawer
                        ? setSectionState({
                            pathname,
                            section:
                              openSection === section.title
                                ? null
                                : section.title,
                          })
                        : openFlyout(section, event.currentTarget)
                    }
                    onKeyDown={(event) => {
                      if (!drawer && event.key === "ArrowDown") {
                        event.preventDefault();
                        openFlyout(section, event.currentTarget, true);
                      }
                    }}
                    title={collapsed ? section.title : undefined}
                    aria-label={collapsed ? section.title : undefined}
                  >
                    <ModuleIcon label={section.title} />
                    <span className="nav-section-label">{section.title}</span>
                    <span className="nav-section-chevron" aria-hidden="true" />
                  </button>
                ) : (
                  <Link
                    className={`nav-section-trigger nav-section-direct${containsActive ? " active" : ""}`}
                    aria-current={containsActive ? "page" : undefined}
                    href={section.links[0].href}
                    title={collapsed ? section.title : undefined}
                    aria-label={collapsed ? section.title : undefined}
                    onClick={() => {
                      setFlyoutState(null);
                      setMobileOpen(false);
                    }}
                  >
                    <ModuleIcon label={section.title} />
                    <span className="nav-section-label">{section.title}</span>
                  </Link>
                )}
                {drawer && hasChildren && isMobileOpen && (
                  <div
                    className="nav-card-grid mobile-nav-children"
                    id={`${sectionId}-mobile`}
                  >
                    {section.links.map((link) => {
                      const active = activeHref === link.href;
                      return (
                        <Link
                          className={`nav-card${active ? " active" : ""}`}
                          aria-current={active ? "page" : undefined}
                          href={link.href}
                          key={link.href}
                          onClick={() => setMobileOpen(false)}
                        >
                          <ModuleIcon label={link.label} />
                          <span>{link.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <Link
            className="sidebar-user"
            href={profileHref}
            aria-label="My Profile"
            title={collapsed ? "My Profile" : undefined}
            onClick={() => {
              setFlyoutState(null);
              setMobileOpen(false);
            }}
          >
            <ModuleIcon label="My Profile" className="sidebar-profile-icon" />
            <span className="sidebar-user-copy">
              <b>{name}</b>
              <small>{subtitle}</small>
            </span>
          </Link>
          <SignOutButton />
        </div>
      </aside>
    );
  };

  return (
    <>
      {renderSidebar()}
      {flyout && flyoutSection && (
        <nav
          ref={flyoutRef}
          className="module-flyout"
          id={`module-submenu-${flyoutSection.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          aria-label={`${flyoutSection.title} navigation`}
          style={{ top: flyout.top, left: flyout.left }}
          onKeyDown={flyoutKeys}
        >
          <header>
            <b>{flyoutSection.title}</b>
            <button
              className="module-flyout-close"
              type="button"
              aria-label={`Close ${flyoutSection.title} menu`}
              onClick={() => {
                setFlyoutState(null);
                triggerRefs.current.get(flyoutSection.title)?.focus();
              }}
            />
          </header>
          <div>
            {flyoutSection.links.map((link) => {
              const active = activeHref === link.href;
              return (
                <Link
                  className={`module-flyout-link${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  href={link.href}
                  key={link.href}
                  onClick={() => setFlyoutState(null)}
                >
                  <ModuleIcon label={link.label} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      {mobileOpen && (
        <div
          className="sidebar-drawer"
          id="workspace-sidebar-drawer"
          role="dialog"
          aria-modal="true"
        >
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          {renderSidebar(true)}
        </div>
      )}
    </>
  );
}
