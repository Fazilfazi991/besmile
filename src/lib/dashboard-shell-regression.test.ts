import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const strip = readFileSync(new URL('../components/team-attendance-strip.tsx', import.meta.url), 'utf8');
const adminLayout = readFileSync(new URL('../app/admin/layout.tsx', import.meta.url), 'utf8');
const employeeLayout = readFileSync(new URL('../app/employee/layout.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const navbarStyles = readFileSync(new URL('../app/navbar-layout.css', import.meta.url), 'utf8');

describe('dashboard shell regressions', () => {
  it('uses the approved Performance Snapshot copy in every rendered strip state', () => {
    expect(strip).toContain("const snapshotTitle = 'Performance Snapshot'");
    expect(strip).toContain("const snapshotSubtitle = 'Live workload and performance overview'");
    expect(strip).not.toContain('Team Today');
    expect(strip).not.toContain('Live attendance overview');
    expect(strip).toContain('View attendance');
  });

  it('keeps identity as the non-shrinking right end of the shared navbar', () => {
    for (const layout of [adminLayout, employeeLayout]) {
      expect(layout).toContain('className="topbar-actions"');
      expect(layout).toContain('className="topbar-user"');
    }
    expect(styles).toContain("@import './navbar-layout.css';");
    expect(navbarStyles).toContain('.topbar-actions{min-width:0;flex:1 1 auto;justify-content:flex-end;margin-left:auto}');
    expect(navbarStyles).toContain('.topbar-user{min-width:0;max-width:230px;flex:0 0 auto}');
    expect(styles).toContain('html[data-theme="colorful"] .app-topbar');
  });
});
