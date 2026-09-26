export function executiveTitle(role: string | null | undefined, designation?: string | null) {
  if (role === 'chairman') return 'Chairman';
  if (role === 'director') return 'Managing Director';
  return designation || 'Employee';
}

export function displayWorkEmail(profile: { work_email?: string | null; email?: string | null }) {
  return profile.work_email?.trim() || null;
}
