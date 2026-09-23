import { officialDocumentTypes, type OfficialDocumentType } from './official-document-types';

export const officialDocumentPermissions = ['documents.manage', 'documents.employee.manage'] as const;
export const operationalOfficialDocumentPermission = 'documents.official.generate';
export const operationalOfficialDocumentTypes: readonly OfficialDocumentType[] = [
  'offer_letter', 'appointment_letter', 'experience_letter',
  'general_report', 'sales_report', 'custom_official_document',
];

export async function officialDocumentAccess(db: any) {
  const permissions = [...officialDocumentPermissions, operationalOfficialDocumentPermission];
  const checks = await Promise.all(permissions.map((permission_code) => db.rpc('has_permission', { permission_code })));
  const manager = checks.slice(0, officialDocumentPermissions.length).some((result) => result.data === true);
  const operational = checks[officialDocumentPermissions.length].data === true;
  // Explicit MOM grants only; has_permission alone has a super-admin bypass.
  const mom = await db.rpc('official_mom_upload_allowed');
  return {
    manager,
    operational,
    // A MOM-only capability; this does not confer general upload/manage access.
    canUploadMom: !mom.error && mom.data === true,
    allowedTypes: manager
      ? officialDocumentTypes.map((type) => type.key)
      : operational ? [...operationalOfficialDocumentTypes] : [],
  };
}

export async function canGenerateOfficialDocuments(db: any) {
  return (await officialDocumentAccess(db)).allowedTypes.length > 0;
}
