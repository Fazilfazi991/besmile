import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(process.cwd(), 'src/app/employee/meetings/page.tsx'), 'utf8');

describe('meeting cancellation flow', () => {
  it('uses the modal confirmation flow and prevents duplicate cancellation submits', () => {
    expect(page).toContain('ConfirmationDialog');
    expect(page).toContain("if (!cancelling || cancelPending) return");
    expect(page).toContain('pending={cancelPending}');
  });

  it('keeps cancellation failures scoped to the confirmation dialog and hides raw backend errors', () => {
    expect(page).toContain("setCancelError(e?.code === '42501' ? 'You do not have permission to cancel this meeting.' : \"We couldn't cancel this meeting. Please try again.\")");
    expect(page).not.toContain('setError(e.message)');
    expect(page).toContain('error={cancelError}');
  });
});
