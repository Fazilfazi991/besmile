const demoAvatarByName: Record<string, string> = {
  'abdul hadi': '/employee_demo_dps_webp/abdul_hadi.webp',
  'aiswarya p': '/employee_demo_dps_webp/aiswarya_p.webp',
  'anushma vk': '/employee_demo_dps_webp/anushma_vk.webp',
  'aseel fuad a r': '/employee_demo_dps_webp/aseel_fuad_ar.webp',
  'ayisha muneer': '/employee_demo_dps_webp/ayisha_muneer.webp',
  chairman: '/employee_demo_dps_webp/chairman.webp',
  director: '/employee_demo_dps_webp/director.webp',
  'diya anthikat': '/employee_demo_dps_webp/diya_anthikat.webp',
};

function normalizedName(name?: string | null) {
  return name?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() || '';
}

/** Keeps genuine uploaded or signed photos ahead of client-demo fallbacks. */
export function resolveEmployeeAvatar(fullName?: string | null, profilePhotoUrl?: string | null) {
  return profilePhotoUrl || demoAvatarByName[normalizedName(fullName)] || null;
}

export function employeeAvatarInitials(fullName?: string | null) {
  return fullName?.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'B';
}
