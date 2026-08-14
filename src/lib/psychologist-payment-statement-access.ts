export async function canViewPsychologistPaymentStatements(db: any) {
  const [financial, documents, employeeDocuments] = await Promise.all([
    db.rpc('has_permission', { permission_code: 'psychologist_payments.view' }),
    db.rpc('has_permission', { permission_code: 'documents.manage' }),
    db.rpc('has_permission', { permission_code: 'documents.employee.manage' }),
  ]);
  return financial.data === true && (documents.data === true || employeeDocuments.data === true);
}

export async function canGeneratePsychologistPaymentStatements(db: any) {
  const [financial, documents, employeeDocuments] = await Promise.all([
    db.rpc('has_permission', { permission_code: 'psychologist_payments.manage' }),
    db.rpc('has_permission', { permission_code: 'documents.manage' }),
    db.rpc('has_permission', { permission_code: 'documents.employee.manage' }),
  ]);
  return financial.data === true && (documents.data === true || employeeDocuments.data === true);
}
