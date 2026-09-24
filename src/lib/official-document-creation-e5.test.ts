import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { officialDocumentAccess, operationalOfficialDocumentTypes } from './official-document-access';
import { adminRouteRequirement, employeeRouteRequirement, permissionAllows } from './permission-access';

const source = (path: string) => readFileSync(path, 'utf8');
const migration = source('supabase/migrations/20260915144157_e5_official_document_creation.sql');

describe('E5 operational official-document creation correction', () => {
  it('shows an Assistant Manager creator but not operational document administration', () => {
    const permissions = new Set(['admin.shell', 'documents.employee.view', 'documents.official.generate']);
    expect(permissionAllows(permissions, employeeRouteRequirement('/employee/documents/generate'))).toBe(true);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/documents/generate'))).toBe(true);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/documents'))).toBe(false);
    expect(permissionAllows(new Set(['documents.employee.view']), employeeRouteRequirement('/employee/documents/generate'))).toBe(false);
    expect(source('src/app/employee/documents/page.tsx')).toContain('OfficialDocumentActions');
  });

  it('limits the creator to operational types while managers keep the existing catalogue', async () => {
    const operational = await officialDocumentAccess({ rpc: async (_: string, { permission_code }: { permission_code?: string } = {}) => ({ data: permission_code === 'documents.official.generate' }) });
    expect(operational.canUploadMom).toBe(false);
    expect(operational.allowedTypes).toEqual(operationalOfficialDocumentTypes);
    expect(operational.allowedTypes).toContain('offer_letter');
    for (const type of ['salary_slip', 'payment_statement', 'invoice', 'performance_report', 'policy']) expect(operational.allowedTypes).not.toContain(type);
    const manager = await officialDocumentAccess({ rpc: async (_: string, { permission_code }: { permission_code?: string } = {}) => ({ data: permission_code === 'documents.manage' }) });
    expect(manager.canUploadMom).toBe(false);
    expect(manager.allowedTypes.length).toBeGreaterThan(operational.allowedTypes.length);
    expect(manager.allowedTypes).toContain('salary_slip');
  });

  it('does not turn the official creator into a broad profile, document, or Storage manager', () => {
    expect(migration).toContain("code = 'documents.official.generate'");
    expect(migration).toContain("designation = 'Assistant Manager'");
    expect(migration).toContain("and uploaded_by = (select auth.uid())");
    expect(migration).toContain("and source_type = 'official_generated'");
    expect(migration).toContain("and owner_id = (select auth.uid())::text");
    expect(migration).toContain("and (storage.foldername(name))[3] = 'official'");
    expect(migration).toContain('operational official orphan PDF cleanup');
    expect(migration).toContain('and not exists (');
    expect(migration).toContain('official_document_employee_is_selectable');
    expect(migration).toContain('search_official_document_employees');
    expect(migration).toContain('revoke all on function public.search_official_document_employees(text) from public, anon');
    expect(migration).not.toMatch(/grant all on table public\.profiles|disable row level security|documents\.employee\.manage'\s*\)\s*insert/i);
    const generate = source('src/app/api/documents/official/generate/route.ts');
    expect(generate).toContain('access.allowedTypes.includes(input.documentType)');
    expect(generate).toContain('official_document_employee_is_selectable');
    const context = source('src/app/api/documents/official/context/route.ts');
    expect(context).toContain(".eq('uploaded_by', user.id)");
    expect(context).toContain('allowedTypes: access.allowedTypes');
  });
});
