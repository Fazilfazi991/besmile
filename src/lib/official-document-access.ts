export const officialDocumentPermissions = ['documents.manage', 'documents.employee.manage'] as const;

export async function canGenerateOfficialDocuments(db: any) {
  const checks = await Promise.all(officialDocumentPermissions.map((permission_code) => db.rpc('has_permission', { permission_code })));
  return checks.some((result) => result.data === true);
}
