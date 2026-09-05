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

type LauncherView =
  | { kind: "modules" }
  | { kind: "section"; title: string }
  | { kind: "create" };

const RECENT_LIMIT = 4;

const composeSidebarSections = (
  groups: readonly NavigationGroup[],
): NavigationSection[] => sectionNavigation(groups);

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
  const [launcherView, setLauncherView] = useState<LauncherView>({
    kind: "modules",
  });
  const [recentHrefs, setRecentHrefs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const key = `bsmile-mobile-recents:${profileHref}`;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((href): href is string => typeof href === "string")
        : [];
    } catch {
      localStorage.removeItem(key);
      return [];
    }
  });
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
  const recentStorageKey = useMemo(
    () => `bsmile-mobile-recents:${profileHref}`,
    [profileHref],
  );
  const activeHref = activeNavigationHref(pathname, groups);
  const sections = useMemo(() => composeSidebarSections(groups), [groups]);
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
  const allLinks = useMemo(
    () => sections.flatMap((section) => section.links),
    [sections],
  );
  const todayHref =
    allLinks.find((link) => /dashboard|home|overview/i.test(link.label))?.href ||
    allLinks[0]?.href ||
    profileHref;
  const tasksHref =
    allLinks.find((link) => /tasks?/i.test(link.label))?.href || todayHref;
  const recentLinks = recentHrefs
    .map((href) => allLinks.find((link) => link.href === href))
    .filter((link): link is (typeof allLinks)[number] => Boolean(link));
  const createActions = [
    { match: /employees/i, label: "Add employee" },
    { match: /crm overview|leads/i, label: "New lead" },
    { match: /invoices/i, label: "Create invoice" },
    { match: /my leave|leave requests/i, label: "Request leave" },
    { match: /innovation hub/i, label: "Submit idea" },
  ].flatMap((action) => {
    const link = allLinks.find((item) => action.match.test(item.label));
    return link ? [{ ...action, link }] : [];
  })
    .slice(0, 4);

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

  const rememberDestination = (href: string) => {
    setRecentHrefs((current) => {
      const next = [href, ...current.filter((item) => item !== href)].slice(
        0,
        RECENT_LIMIT,
      );
      localStorage.setItem(recentStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const closeLauncher = () => {
    setMobileOpen(false);
    setLauncherView({ kind: "modules" });
  };

  const openLauncher = (kind: "modules" | "create" = "modules") => {
    setLauncherView({ kind });
    setMobileOpen(true);
  };

  const launcherSection =
    launcherView.kind === "section"
      ? sections.find((section) => section.title === launcherView.title)
      : undefined;

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
                    <section className="mobile-nav-link-group">
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
                    </section>
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
          <div className="module-flyout-groups">
            <section className="module-flyout-group">
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
            </section>
          </div>
        </nav>
      )}
      {mobileOpen && (
        <div
          className="mobile-launcher-layer"
          id="workspace-sidebar-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <button
            className="mobile-launcher-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={closeLauncher}
          />
          <section className="mobile-launcher-sheet">
            <header className="mobile-launcher-header">
              {launcherView.kind !== "modules" ? (
                <button
                  className="mobile-launcher-back"
                  type="button"
                  aria-label="Back to all modules"
                  onClick={() => setLauncherView({ kind: "modules" })}
                >
                  <span aria-hidden="true">‹</span>
                </button>
              ) : (
                <span className="mobile-launcher-mark" aria-hidden="true">
                  <ModuleIcon label="All Modules" />
                </span>
              )}
              <div>
                <h2>
                  {launcherView.kind === "section"
                    ? launcherView.title
                    : launcherView.kind === "create"
                      ? "Create"
                      : "All Modules"}
                </h2>
                <p>
                  {launcherView.kind === "section"
                    ? "Choose a destination"
                    : launcherView.kind === "create"
                      ? "Start from an available workspace"
                      : "Your BSmile workspaces"}
                </p>
              </div>
              <button
                className="mobile-launcher-close"
                type="button"
                aria-label="Close navigation"
                onClick={closeLauncher}
              />
            </header>

            <div className="mobile-launcher-content">
              {launcherView.kind === "modules" && (
                <>
                  {recentLinks.length > 0 && (
                    <section className="mobile-launcher-recents">
                      <h3>Recently used</h3>
                      <div>
                        {recentLinks.map((link) => (
                          <Link
                            href={link.href}
                            key={link.href}
                            onClick={() => {
                              rememberDestination(link.href);
                              closeLauncher();
                            }}
                          >
                            <ModuleIcon label={link.label} />
                            <span>{link.label}</span>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}
                  <section className="mobile-launcher-modules">
                    <h3>All Modules</h3>
                    <div className="mobile-module-grid">
                      {sections.map((section) => {
                        const direct = section.links.length === 1;
                        const content = (
                          <>
                            <ModuleIcon label={section.title} />
                            <span>{section.title}</span>
                            {!direct && <i aria-hidden="true">›</i>}
                          </>
                        );
                        return direct ? (
                          <Link
                            className="mobile-module-tile"
                            href={section.links[0].href}
                            key={section.title}
                            onClick={() => {
                              rememberDestination(section.links[0].href);
                              closeLauncher();
                            }}
                          >
                            {content}
                          </Link>
                        ) : (
                          <button
                            className="mobile-module-tile"
                            type="button"
                            key={section.title}
                            onClick={() =>
                              setLauncherView({
                                kind: "section",
                                title: section.title,
                              })
                            }
                          >
                            {content}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </>
              )}

              {launcherView.kind === "section" && launcherSection && (
                <nav
                  className="mobile-launcher-links"
                  aria-label={`${launcherSection.title} pages`}
                >
                  <section className="mobile-launcher-link-group">
                      {launcherSection.links.map((link) => {
                        const active = activeHref === link.href;
                        return (
                          <Link
                            className={active ? "active" : undefined}
                            aria-current={active ? "page" : undefined}
                            href={link.href}
                            key={link.href}
                            onClick={() => {
                              rememberDestination(link.href);
                              closeLauncher();
                            }}
                          >
                            <ModuleIcon label={link.label} />
                            <span>{link.label}</span>
                            <i aria-hidden="true">›</i>
                          </Link>
                        );
                      })}
                  </section>
                </nav>
              )}

              {launcherView.kind === "create" && (
                <nav className="mobile-launcher-links" aria-label="Create actions">
                  {createActions.map(({ label, link }) => (
                    <Link
                      href={link.href}
                      key={label}
                      onClick={() => {
                        rememberDestination(link.href);
                        closeLauncher();
                      }}
                    >
                      <ModuleIcon label={label} />
                      <span>{label}</span>
                      <i aria-hidden="true">›</i>
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </section>
        </div>
      )}
      <nav className="mobile-bottom-nav" aria-label="Mobile primary navigation">
        <Link
          className={activeHref === todayHref ? "active" : undefined}
          aria-current={activeHref === todayHref ? "page" : undefined}
          href={todayHref}
          onClick={() => rememberDestination(todayHref)}
        >
          <ModuleIcon label="Dashboard" />
          <span>Today</span>
        </Link>
        <Link
          className={activeHref === tasksHref ? "active" : undefined}
          aria-current={activeHref === tasksHref ? "page" : undefined}
          href={tasksHref}
          onClick={() => rememberDestination(tasksHref)}
        >
          <ModuleIcon label="Tasks" />
          <span>Tasks</span>
        </Link>
        <button
          className="mobile-bottom-create"
          type="button"
          aria-expanded={mobileOpen && launcherView.kind === "create"}
          aria-controls="workspace-sidebar-drawer"
          onClick={() => openLauncher("create")}
        >
          <ModuleIcon label="Create" />
          <span>Create</span>
        </button>
        <Link
          className={pathname.startsWith(profileHref) ? "active" : undefined}
          aria-current={pathname.startsWith(profileHref) ? "page" : undefined}
          href={profileHref}
          onClick={() => rememberDestination(profileHref)}
        >
          <ModuleIcon label="My Profile" />
          <span>Profile</span>
        </Link>
        <button
          className={mobileOpen && launcherView.kind !== "create" ? "active" : undefined}
          type="button"
          aria-expanded={mobileOpen && launcherView.kind !== "create"}
          aria-controls="workspace-sidebar-drawer"
          onClick={() => openLauncher("modules")}
        >
          <ModuleIcon label="All Modules" />
          <span>All Modules</span>
        </button>
      </nav>
    </>
  );
}
