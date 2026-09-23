import { describe, expect, it } from 'vitest';
import { buildOrganizationTree, reportingManagerError, type OrganizationEmployee } from './organization-chart-config';
const employee = (id: string, manager_id: string | null = null, extra: Partial<OrganizationEmployee> = {}): OrganizationEmployee => ({ id, full_name: `Person ${id}`, designation: 'Employee', manager_id, department_id: null, department_name: null, avatar_url: null, status: 'active', can_edit: false, ...extra });
const flatten = (nodes: ReturnType<typeof buildOrganizationTree>): string[] => nodes.flatMap(node => [node.id, ...flatten(node.children)]);
describe('dynamic organization hierarchy', () => {
  it('uses IDs and actual titles, including a Chairman with a Director authorization role', () => {
    const people = [employee('gm','director'),employee('director','chair',{designation:'Director'}),employee('chair',null,{designation:'Chairman'}),employee('staff','gm')];
    const tree = buildOrganizationTree(people);
    expect(flatten(tree)).toEqual(['chair','director','gm','staff']);
    expect(tree[0].children[0].designation).toBe('Director');
  });
  it('does not infer relationships or rename employees with missing managers', () => {
    const tree = buildOrganizationTree([employee('a'),employee('z',null,{designation:'Chairman'})]);
    expect(tree.map(node => node.id)).toEqual(['z','a']);
    expect(tree.every(node => !node.children.length)).toBe(true);
  });
  it('filters inactive employees and preserves their active reports as explicit roots', () => {
    const tree = buildOrganizationTree([employee('a',null,{status:'terminated'}),employee('b','a'),employee('c',null,{status:'inactive'})]);
    expect(flatten(tree)).toEqual(['b']);expect(tree[0].unassigned).toBe(true);
  });
  it('handles duplicate names, deep trees, and legacy cycles without losing or repeating people', () => {
    const tree = buildOrganizationTree([employee('a','b'),employee('b','a'),employee('c','b'),employee('d',null,{full_name:'Person a'})]);
    expect(flatten(tree).sort()).toEqual(['a','b','c','d']);
  });
  it('reflects changed manager, title, department and avatar source on the next read', () => {
    const people = [employee('a'),employee('b'),employee('c','a')];
    people[2] = {...people[2],manager_id:'b',designation:'Custom position',department_name:'Marketing',avatar_url:'c/new.png'};
    const changed = buildOrganizationTree(people)[1].children[0];
    expect(changed).toMatchObject({id:'c',designation:'Custom position',department_name:'Marketing',avatar_url:'c/new.png'});
  });
  it('rejects self-manager, indirect cycles, inactive managers and Chairman subordination', () => {
    const people = [employee('a'),employee('b','a'),employee('c','b'),employee('d',null,{status:'inactive'})];
    expect(reportingManagerError(people,'a','a')).toMatch(/themselves/);
    expect(reportingManagerError(people,'a','c')).toMatch(/cycle/);
    expect(reportingManagerError(people,'a','d')).toMatch(/active/);
    expect(reportingManagerError(people,'c','a','Chairman')).toMatch(/top/);
    expect(reportingManagerError(people,'c','a','Director')).toBe('');
  });
});
