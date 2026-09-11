import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
describe('mobile profile polish contracts', () => {
  it('reuses canonical appearance and sign-out in the mobile account area', () => {
    const sidebar = read('src/components/permission-sidebar.tsx');
    const account = sidebar.split('aria-label="Account and appearance"')[1].split('</section>')[0];
    expect(account).toContain('<ThemeModeSwitcher />');
    expect(account).toContain('<SignOutButton />');
    expect(sidebar.match(/<SignOutButton \/>/g)).toHaveLength(2);
  });
  it('preserves canonical logout and browser-local shared theme persistence', () => {
    expect(read('src/components/sign-out-button.tsx')).toContain("await signOut();");
    expect(read('src/components/sign-out-button.tsx')).toContain("router.replace('/sign-in')");
    expect(read('src/lib/auth.ts')).toContain('supabase.auth.signOut()');
    expect(read('src/components/theme-mode-switcher.tsx')).toContain("window.addEventListener('storage', onChange)");
  });
  it('constrains patient headers without hiding text or actions', () => {
    const workspace = read('src/components/patient-workspace.tsx');
    expect(workspace).toContain('patient-workspace min-w-0 max-w-full');
    expect(workspace).toContain('min-w-0 flex-1 basis-60');
    expect(workspace).toContain('flex max-w-full flex-wrap items-start gap-2');
    expect(workspace).toContain('[overflow-wrap:anywhere]');
  });
  it('keeps mobile controls touch-sized and colorful headings on dark surfaces', () => {
    const css = read('src/app/workspace-density.css');
    expect(css).toContain('.mobile-account-controls .sidebar-signout{min-height:44px');
    expect(css).toContain('.mobile-account-controls .theme-mode-switcher button{flex:1;min-height:44px');
    expect(css).toContain('.mobile-launcher-sheet{background:#151b38;color:#e9edff}');
    expect(css).toContain('.mobile-launcher-content h3{color:#e9edff}');
  });
});
