'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type MobileNavigationState = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const MobileNavigationContext = createContext<MobileNavigationState | null>(null);

export function MobileNavigationProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <MobileNavigationContext.Provider value={{ mobileOpen, setMobileOpen }}>{children}</MobileNavigationContext.Provider>;
}

export function useMobileNavigation() {
  const state = useContext(MobileNavigationContext);
  if (!state) throw new Error('Mobile navigation must be used within MobileNavigationProvider.');
  return state;
}

export function MobileNavigationTrigger() {
  const { mobileOpen, setMobileOpen } = useMobileNavigation();
  return <button className="mobile-menu-button" type="button" aria-label="Open navigation" title="Open navigation" aria-expanded={mobileOpen} aria-controls="workspace-sidebar-drawer" onClick={() => setMobileOpen(true)}><span aria-hidden="true">☰</span></button>;
}
