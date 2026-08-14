import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminNavigation, employeeNavigation, filterNavigation } from './permission-access';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260814140000_batch_8_client_crm_restructure.sql'), 'utf8');
const leadPage = readFileSync(resolve(process.cwd(), 'src/app/admin/crm/leads/[id]/page.tsx'), 'utf8');
const clientForm = readFileSync(resolve(process.cwd(), 'src/components/patient-ui.tsx'), 'utf8');

describe('Batch 8 Client & CRM restructuring', () => {
  it('groups canonical client, lead, follow-up, and scheduling routes without duplicate admin links', () => {
    const crm = adminNavigation.find(group => group.title === 'CLIENT & CRM');
    expect(crm?.links.map(link => link.label)).toEqual(expect.arrayContaining(['Clients', 'Leads', 'Follow-ups', 'Appointment & Scheduling']));
    expect(adminNavigation.find(group => group.title === 'OPERATIONS')?.links.map(link => link.label)).not.toContain('Clients');
    expect(adminNavigation.find(group => group.title === 'WORK MANAGEMENT')?.links.map(link => link.label)).not.toContain('Appointment & Scheduling');
    expect(filterNavigation(employeeNavigation, new Set(['patients.view', 'crm.view_assigned', 'doctor_scheduling.view'])).find(group => group.title === 'CLIENT & CRM')).toBeDefined();
  });

  it('uses approved Client and Psychologist terminology in changed client forms', () => {
    expect(clientForm).toContain('Add Client');
    expect(clientForm).toContain('Client ID');
    expect(clientForm).toContain('Assigned Psychologist');
    expect(clientForm).not.toContain('Create patient');
  });

  it('preserves Justdial as the existing canonical CRM source', () => {
    const sourceMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260810210000_add_justdial_lead_source.sql'), 'utf8');
    expect(sourceMigration).toContain("values ('Justdial')");
  });

  it('links a confirmed exact-phone client without matching by name or creating a second client', () => {
    expect(migration).toContain('existing_client uuid');
    expect(migration).toContain('btrim(client_row.phone) <> btrim(lead_row.phone)');
    expect(migration).toContain('lead_linked_to_existing_client');
    expect(migration).not.toMatch(/full_name.*=.*lead_row\.full_name/i);
    expect(leadPage).toContain('findClientsByExactPhone');
    expect(leadPage).toContain('Names are not used for matching.');
    expect(leadPage).toContain('Link existing client');
  });

  it('keeps finance out of CRM-only navigation', () => {
    const labels = filterNavigation(adminNavigation, new Set(['crm.view_team'])).flatMap(group => group.links.map(link => link.label));
    expect(labels).toContain('CRM Overview');
    expect(labels).not.toEqual(expect.arrayContaining(['Finance Dashboard', 'Payroll', 'Psychologist Payments', 'Invoices']));
  });
});
