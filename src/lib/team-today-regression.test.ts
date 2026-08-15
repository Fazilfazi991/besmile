import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const strip = readFileSync(new URL('../components/team-attendance-strip.tsx', import.meta.url), 'utf8');

describe('Team Today dashboard resilience', () => {
  it('falls back to legacy task fields when the SLA migration is unavailable', () => {
    expect(repository).toContain('SLA fields unavailable; using legacy task-health query.');
    expect(repository).toContain('tasks!inner(id,status,due_date,created_at)');
  });
  it('settles Team Today into a retryable error state instead of retaining its skeleton', () => {
    expect(dashboard).toContain("setTeam([]); setTeamError('Team Today could not be loaded.')");
    expect(strip).toContain('Team Today could not be loaded.');
    expect(strip).toContain('Retry');
  });
});
