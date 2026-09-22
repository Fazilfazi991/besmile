import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(resolve(process.cwd(), 'src/lib/doctor-scheduling-repository.ts'), 'utf8');
const scheduling = readFileSync(resolve(process.cwd(), 'src/components/doctor-scheduling.tsx'), 'utf8');

describe('appointment payable detail', () => {
  it('loads only the linked session and payable fields required by the detail panel', () => {
    expect(repository).toContain('session_record:psychologist_session_records(id,submitted_at)');
    expect(repository).toContain('payable:psychologist_session_payables(id,status,payable_amount,due_date,paid_at,finance_transaction_id)');
  });

  it('does not add settlement controls to appointment details', () => {
    expect(scheduling).not.toContain('Mark paid</button>');
    expect(scheduling).not.toContain("rpc('settle_psychologist_session_payable'");
  });
});
