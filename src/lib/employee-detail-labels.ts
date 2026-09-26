export function employeeDetailLabels(role: string | null | undefined, designation: string | null | undefined) {
  const managingDirector = role?.trim().toLowerCase() === 'director' && designation?.trim().toLowerCase() === 'director';
  return {
    title: managingDirector ? 'Managing Director' : designation || 'Employee',
    role: managingDirector ? 'Managing Director' : role,
  };
}
