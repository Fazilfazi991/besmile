import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260807195909_lead_to_patient_conversion.sql'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'src/app/admin/crm/leads/[id]/page.tsx'), 'utf8');

describe('lead to patient conversion', () => {
  it('keeps conversion atomic, auditable, unique, and permission checked', () => {
    for (const value of ['converted_patient_id', 'for update', "public.has_permission('crm.manage_all')", "public.has_permission('patients.create')", 'Patient ID is required.', 'already in use', 'lead_converted_to_patient', "name = 'Converted'"]) expect(migration).toContain(value);
    expect(migration).toContain('security definer');
    expect(migration).toContain('from public, anon, authenticated');
    expect(page).toContain('Convert to Client');
    expect(page).toContain('convertLeadToClient');
    expect(page).toContain('That Client ID is already in use. Choose a different ID.');
  });
});
