import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adminRouteRequirement, employeeRouteRequirement, filterNavigation, permissionAllows, employeeNavigation } from './permission-access';

const migration = readFileSync('supabase/migrations/20260915030947_permissions_client_workspace_e5.sql', 'utf8');
const meetingsPage = readFileSync('src/app/employee/meetings/page.tsx', 'utf8');
const patientWorkspace = readFileSync('src/components/patient-workspace.tsx', 'utf8');
const uploadRoute = readFileSync('src/app/api/patients/[patientId]/documents/upload/route.ts', 'utf8');
const adminLeadPage = readFileSync('src/app/admin/crm/leads/[id]/page.tsx', 'utf8');
const employeeLeadPage = readFileSync('src/app/employee/crm/leads/[id]/page.tsx', 'utf8');

describe('E5 permission and client workspace contract', () => {
  it('grants the Administration Assistant Manager operational CRM and official-document bundle without security or hard-delete privileges', () => {
    expect(migration).toContain("'Assistant Manager CRM Operations'");
    expect(migration).toContain("'Administration'");
    expect(migration).toContain("'Assistant Manager'");
    for (const permission of ['admin.shell', 'crm.manage_all', 'crm.import', 'leads.assign', 'sales.edit', 'documents.employee.view']) {
      expect(migration).toContain(`'${permission}'`);
    }
    const bundleBlock = migration.slice(migration.indexOf('with bundle as'), migration.indexOf('-- crm.manage_all'));
    expect(bundleBlock).not.toMatch(/roles\.manage|permissions\.manage|settings\.manage|crm\.delete|grant all/i);
  });

  it('opens canonical CRM routes and official documents for the Assistant Manager permission set', () => {
    const permissions = new Set(['admin.shell', 'crm.manage_all', 'sales.view', 'documents.employee.view']);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/crm/leads/example'))).toBe(true);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/crm/sales'))).toBe(true);
    expect(permissionAllows(permissions, employeeRouteRequirement('/employee/documents'))).toBe(true);
    const links = filterNavigation(employeeNavigation, permissions).flatMap(group => group.links);
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Official Documents', href: '/employee/documents' }),
      expect.objectContaining({ href: '/admin/crm/leads' }),
      expect.objectContaining({ href: '/admin/crm/sales' }),
    ]));
  });

  it('uses an authenticated, atomic and idempotent Lead to Sale RPC while protecting hard deletion', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain('for update');
    expect(migration).toContain('where lead_id = target_lead');
    expect(migration).toContain('return sale_row');
    expect(migration).toMatch(/created_by\s*\)\s*values\s*\(\s*target_lead/i);
    expect(migration).toContain('crm_sale_lead_can_view(lead_id)');
    expect(migration).toContain('revoke all on function public.crm_sale_lead_can_view(uuid) from public, anon');
    expect(migration).toContain("using(public.has_permission('crm.delete'))");
    expect(migration).toContain('revoke all on function public.convert_crm_lead_to_sale');
    expect(migration).toContain('grant execute on function public.convert_crm_lead_to_sale');
    expect(adminLeadPage).toContain('Array.isArray(lead.crm_sales) ? lead.crm_sales[0] : lead.crm_sales');
    expect(employeeLeadPage).toContain('Array.isArray(lead.crm_sales) ? lead.crm_sales[0] : lead.crm_sales');
  });

  it('keeps meeting notes immutable, author-attributed, and scoped to canonical meeting visibility', () => {
    expect(migration).toContain('create table if not exists public.meeting_note_entries');
    expect(migration).toContain('author_profile_id uuid not null references public.profiles');
    expect(migration).toContain('using(public.meeting_visible(meeting_id))');
    expect(migration).toContain('author_profile_id = auth.uid()');
    expect(migration).toContain('participant.employee_id = auth.uid()');
    expect(migration).toContain('revoke update, delete on table public.meeting_note_entries from authenticated');
    expect(migration).toContain('revoke all on table public.meeting_note_entries from public, anon');
    expect(meetingsPage).toContain('note.author?.full_name');
    expect(meetingsPage).toContain('noteTimestamp(note.created_at)');
    expect(meetingsPage).toContain('Write a note for meeting participants');
  });

  it('keeps Psychologist access patient-scoped while completing the upload and download UI lifecycle', () => {
    expect(migration).toContain('public.patient_access(document.patient_id)');
    expect(migration).toContain("document.storage_key like 'pending-%'");
    expect(migration).toContain('grant select, insert, update on table public.patient_documents to authenticated');
    expect(migration).toContain('revoke all on table public.patient_documents from anon');
    expect(patientWorkspace).toContain("action('patient_documents.upload', 'Upload Document'");
    expect(patientWorkspace).toContain('<PatientDocumentActions');
    expect(uploadRoute).toContain("db.from('patients').select('id')");
    expect(uploadRoute).toContain('Client not found or access denied.');
    expect(uploadRoute).toContain("normalizeClientError(error, 'Unable to upload this document.')");
  });

  it('does not grant Psychologists view-all or weaken management-only document classification', () => {
    expect(migration).not.toMatch(/psychologist[^;]*patients\.view_all/i);
    expect(migration).not.toMatch(/visibility\s*=\s*'management_only'[^;]*psychologist/i);
    expect(migration).not.toMatch(/grant\s+all|\bto\s+public\b|\bto\s+anon\b/i);
  });
});
