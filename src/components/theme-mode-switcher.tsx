'use client';

import { useEffect, useSyncExternalStore } from 'react';

type ThemeMode = 'standard' | 'colorful';

const storageKey = 'bsmile-theme-mode';
const changeEvent = 'bsmile-theme-change';

const subscribe = (onChange: () => void) => {
  window.addEventListener(changeEvent, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener('storage', onChange);
  };
};

const getSnapshot = (): ThemeMode => window.localStorage.getItem(storageKey) === 'colorful' ? 'colorful' : 'standard';

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode === 'colorful' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'colorful' ? '#10162d' : '#0f766e');
}

export function ThemeModeSwitcher() {
  const mode = useSyncExternalStore<ThemeMode>(subscribe, getSnapshot, (): ThemeMode => 'standard');

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const selectMode = (nextMode: ThemeMode) => {
    window.localStorage.setItem(storageKey, nextMode);
    window.dispatchEvent(new Event(changeEvent));
  };

  return <div className="theme-mode-switcher" role="group" aria-label="Choose workspace theme">
    <button type="button" className={mode === 'standard' ? 'is-active' : ''} aria-pressed={mode === 'standard'} onClick={() => selectMode('standard')}>Standard <span>Mode</span></button>
    <button type="button" className={mode === 'colorful' ? 'is-active' : ''} aria-pressed={mode === 'colorful'} onClick={() => selectMode('colorful')}>Colorful <span>Mode</span></button>
  </div>;
}
