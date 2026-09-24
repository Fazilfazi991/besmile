import { describe, expect, it } from 'vitest';
import { ancestorIds, initialCollapsedBranches, layoutOrganization, organizationCardHeight, organizationCardWidth } from './organization-chart-layout';
import type { OrganizationEmployee } from './organization-chart-config';

const person = (id: string, manager_id: string | null = null, extra: Partial<OrganizationEmployee> = {}): OrganizationEmployee => ({ id, full_name: `Person ${id}`, designation: 'Employee', manager_id, department_id: null, department_name: null, avatar_url: null, status: 'active', can_edit: false, ...extra });

function noOverlaps(nodes: ReturnType<typeof layoutOrganization>['nodes']) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    expect(a.x + organizationCardWidth <= b.x || b.x + organizationCardWidth <= a.x || a.y + organizationCardHeight <= b.y || b.y + organizationCardHeight <= a.y).toBe(true);
  }
}

describe('Dagre organization layout', () => {
  it('keeps separate real roots and only draws stored reporting relationships', () => {
    const people = [person('chair', null, { designation: 'Chairman' }), person('director', null, { designation: 'Director' }), person('gm'), person('staff', 'gm')];
    const layout = layoutOrganization(people, new Set());
    expect(layout.nodes.map(node => node.id).sort()).toEqual(['chair', 'director', 'gm', 'staff']);
    expect(layout.edges).toEqual([{ source: 'gm', target: 'staff' }]);
    noOverlaps(layout.nodes);
  });

  it('lays out a wide multi-level 25-person team without losing or overlapping employees', () => {
    const people = [person('root'), ...Array.from({ length: 12 }, (_, i) => person(`manager-${i}`, 'root')), ...Array.from({ length: 12 }, (_, i) => person(`staff-${i}`, `manager-${i}`))];
    const layout = layoutOrganization(people, new Set());
    expect(layout.nodes).toHaveLength(25);
    expect(layout.edges).toHaveLength(24);
    noOverlaps(layout.nodes);
    const overview = initialCollapsedBranches(people);
    const reduced = layoutOrganization(people, overview);
    expect(reduced.nodes.length).toBeLessThanOrEqual(14);
    expect(overview.size).toBeGreaterThan(0);
    expect(ancestorIds(people, 'staff-3')).toEqual(['manager-3', 'root']);
  });

  it('keeps four legitimate roots and the principal first tier even when they exceed the soft budget', () => {
    const people = [person('chair'), person('director'), person('gm'), person('unassigned'),
      ...Array.from({ length: 11 }, (_, i) => person(`lead-${i}`, 'gm')),
      ...Array.from({ length: 11 }, (_, i) => person(`report-${i}`, `lead-${i}`))];
    const collapsed = initialCollapsedBranches(people, 14);
    const overview = layoutOrganization(people, collapsed);
    expect(overview.nodes).toHaveLength(15);
    expect(overview.nodes.map(node => node.id)).toContain('lead-10');
    expect(collapsed.has('gm')).toBe(false);
    expect(collapsed.has('lead-0')).toBe(true);
    expect(layoutOrganization(people, new Set()).nodes).toHaveLength(26);
    noOverlaps(overview.nodes);
  });

  it('keeps missing-manager reports visible and filters inactive people', () => {
    const layout = layoutOrganization([person('lost', 'inactive'), person('inactive', null, { status: 'inactive' }), person('long', null, { full_name: 'A very long name and title that must never change node geometry', designation: 'A long specialist designation' })], new Set());
    expect(layout.nodes.map(node => node.id).sort()).toEqual(['long', 'lost']);
    expect(layout.edges).toHaveLength(0);
    expect(layout.nodes.find(node => node.id === 'lost')?.unassigned).toBe(true);
    noOverlaps(layout.nodes);
  });

  it('expansion changes only visible nodes and never invents a reporting edge', () => {
    const people = [person('root'), person('middle', 'root'), person('leaf', 'middle')];
    const collapsed = layoutOrganization(people, new Set(['middle']));
    expect(collapsed.nodes.map(node => node.id)).toEqual(['root', 'middle']);
    expect(collapsed.edges).toEqual([{ source: 'root', target: 'middle' }]);
    expect(layoutOrganization(people, new Set()).edges).toEqual([{ source: 'root', target: 'middle' }, { source: 'middle', target: 'leaf' }]);
  });
});
