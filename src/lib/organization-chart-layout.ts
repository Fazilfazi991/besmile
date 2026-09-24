import dagre from '@dagrejs/dagre';
import { buildOrganizationTree, type OrganizationEmployee, type OrganizationNode } from './organization-chart-config';

export const organizationCardWidth = 236;
export const organizationCardHeight = 126;

export type PositionedEmployee = {
  id: string;
  x: number;
  y: number;
  directReports: number;
  hasParent: boolean;
  unassigned: boolean;
};

export type OrganizationLayout = {
  nodes: PositionedEmployee[];
  edges: Array<{ source: string; target: string }>;
};

function descendants(node: OrganizationNode): number {
  return node.children.reduce((total, child) => total + 1 + descendants(child), 0);
}

function visibleCount(roots: OrganizationNode[], collapsed: Set<string>): number {
  const count = (node: OrganizationNode): number => 1 + (collapsed.has(node.id) ? 0 : node.children.reduce((sum, child) => sum + count(child), 0));
  return roots.reduce((sum, root) => sum + count(root), 0);
}

/** Start large directories as an overview; every hidden employee remains reachable by expanding an ancestor. */
export function initialCollapsedBranches(people: OrganizationEmployee[], budget = 14): Set<string> {
  const roots = buildOrganizationTree(people);
  const collapsed = new Set<string>();
  if (visibleCount(roots, collapsed) <= budget) return collapsed;
  const candidates: Array<{ id: string; depth: number; descendants: number }> = [];
  const visit = (node: OrganizationNode, depth: number) => {
    if (node.children.length) candidates.push({ id: node.id, depth, descendants: descendants(node) });
    node.children.forEach(child => visit(child, depth + 1));
  };
  roots.forEach(root => visit(root, 0));
  // Preserve the top level whenever possible, then collapse the largest remaining branches.
  candidates.sort((a, b) => Number(a.depth === 0) - Number(b.depth === 0) || b.descendants - a.descendants || a.id.localeCompare(b.id));
  for (const candidate of candidates) {
    if (visibleCount(roots, collapsed) <= budget) break;
    collapsed.add(candidate.id);
  }
  return collapsed;
}

/** Dagre returns node centers; React Flow positions custom nodes from their top-left corner. */
export function layoutOrganization(people: OrganizationEmployee[], collapsed: Set<string>): OrganizationLayout {
  const roots = buildOrganizationTree(people);
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 70, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));
  const visible: Array<{ node: OrganizationNode; parentId: string | null }> = [];
  const walk = (node: OrganizationNode, parentId: string | null) => {
    visible.push({ node, parentId });
    graph.setNode(node.id, { width: organizationCardWidth, height: organizationCardHeight });
    if (parentId) graph.setEdge(parentId, node.id);
    if (!collapsed.has(node.id)) node.children.forEach(child => walk(child, node.id));
  };
  roots.forEach(root => walk(root, null));
  dagre.layout(graph);
  return {
    nodes: visible.map(({ node, parentId }) => {
      const point = graph.node(node.id);
      return {
        id: node.id,
        x: point.x - organizationCardWidth / 2,
        y: point.y - organizationCardHeight / 2,
        directReports: node.children.length,
        hasParent: parentId !== null,
        unassigned: node.unassigned,
      };
    }),
    edges: visible.filter(item => item.parentId !== null).map(item => ({ source: item.parentId!, target: item.node.id })),
  };
}

export function ancestorIds(people: OrganizationEmployee[], employeeId: string): string[] {
  const byId = new Map(people.map(person => [person.id, person]));
  const ancestors: string[] = [];
  const seen = new Set([employeeId]);
  let managerId = byId.get(employeeId)?.manager_id;
  while (managerId && byId.has(managerId) && !seen.has(managerId)) {
    ancestors.push(managerId);
    seen.add(managerId);
    managerId = byId.get(managerId)?.manager_id;
  }
  return ancestors;
}
