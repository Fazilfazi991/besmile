import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/permission-sidebar.tsx', 'utf8');
const bottomNavigation = source.slice(
  source.indexOf('<nav className="mobile-bottom-nav"'),
  source.indexOf('</nav>', source.indexOf('<nav className="mobile-bottom-nav"')),
);

describe('mobile Teams navigation contract', () => {
  it('keeps the approved five-item navigation labels and removes Create', () => {
    for (const label of ['Today', 'Tasks', 'Teams', 'Profile', 'All Modules']) {
      expect(bottomNavigation).toContain(`<span>${label}</span>`);
    }
    expect(bottomNavigation).not.toContain('<span>Create</span>');
  });

  it('derives Teams from a permission-filtered Chat link and keeps conversation routes active', () => {
    expect(source).toContain('allLinks.find((link) => /^(chat|teams)$/i.test(link.label))?.href');
    expect(bottomNavigation).toContain('pathname.startsWith(teamsHref)');
    expect(bottomNavigation).toContain('href={teamsHref}');
    expect(bottomNavigation).toContain('aria-label="Teams unavailable"');
  });
});
