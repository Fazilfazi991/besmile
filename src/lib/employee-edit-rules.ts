import { normalizeGender } from './gender';

export type EmployeeEditInput = Record<string, unknown>;

export function normalizeDateOnly(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const date = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Joining date must be a valid calendar date.');
  const [year, month, day] = match.slice(1).map(Number);
  const checked = new Date(Date.UTC(year, month - 1, day));
  if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) throw new Error('Joining date must be a valid calendar date.');
  return date;
}

export function employeeEditPayload(input: EmployeeEditInput) {
  const gender = normalizeGender(String(input.gender || ''));
  return {
    ...input,
    gender: gender || null,
    department_id: input.department_id || null,
    manager_id: input.manager_id || null,
    joining_date: normalizeDateOnly(input.joining_date),
  };
}
