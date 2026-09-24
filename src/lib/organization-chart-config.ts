export type OrganizationEmployee = {
  id: string;
  full_name: string;
  designation: string | null;
  manager_id: string | null;
  department_id: string | null;
  department_name: string | null;
  avatar_url: string | null;
  status: string;
  can_edit: boolean;
  photo_url?: string | null;
};
export type OrganizationNode = OrganizationEmployee & { children: OrganizationNode[]; unassigned: boolean };
export const isChairman = (designation: string | null) => designation?.trim().toLowerCase() === 'chairman';

/** Missing/inactive managers and legacy cycles become explicit roots; never invent reporting links. */
export function buildOrganizationTree(employees: OrganizationEmployee[]) {
  const active = employees.filter(person => person.status === 'active');
  const byId = new Map(active.map(person => [person.id, person]));
  const parents = new Map<string, string | null>();
  for (const person of active) {
    let parent = person.manager_id && byId.has(person.manager_id) ? person.manager_id : null;
    const seen = new Set([person.id]);
    let cursor = parent;
    while (cursor) {
      if (seen.has(cursor)) { parent = null; break; }
      seen.add(cursor);
      cursor = byId.get(cursor)?.manager_id || null;
    }
    parents.set(person.id, parent);
  }
  const nodes = new Map(active.map(person => [person.id, {
    ...person, children: [] as OrganizationNode[],
    unassigned: Boolean(person.manager_id && !parents.get(person.id)),
  }]));
  const roots: OrganizationNode[] = [];
  for (const node of nodes.values()) {
    const parent = parents.get(node.id);
    if (parent) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  }
  const sort = (list: OrganizationNode[]) => {
    list.sort((a, b) => Number(isChairman(b.designation)) - Number(isChairman(a.designation)) || a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id));
    list.forEach(node => sort(node.children));
  };
  sort(roots);
  return roots;
}

export function reportingManagerError(employees: OrganizationEmployee[], employeeId: string, managerId: string | null, designation?: string | null) {
  if (!managerId) return '';
  if (isChairman(designation ?? employees.find(person => person.id === employeeId)?.designation ?? null)) return 'The Chairman must remain at the top with no reporting manager.';
  const byId = new Map(employees.map(person => [person.id, person]));
  if (byId.get(managerId)?.status !== 'active') return 'Choose an active employee as reporting manager.';
  const seen = new Set([employeeId]);
  let cursor: string | null = managerId;
  while (cursor) {
    if (seen.has(cursor)) return cursor === employeeId && managerId === employeeId ? 'An employee cannot report to themselves.' : 'This reporting relationship would create a cycle.';
    seen.add(cursor);
    cursor = byId.get(cursor)?.manager_id || null;
  }
  return '';
}
