const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value?: string | null) {
  return uuidPattern.test(String(value || ''));
}

export function patientPath(basePath: string, patient: { id: string; slug?: string | null }) {
  return `${basePath}/${patient.slug || patient.id}`;
}
