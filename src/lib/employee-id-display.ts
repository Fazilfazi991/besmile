export function showEmployeeId(role: string | null | undefined) {
  return role !== 'chairman' && role !== 'director';
}
