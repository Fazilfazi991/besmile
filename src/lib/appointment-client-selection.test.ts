import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPOINTMENT_CLIENT_PAGE_SIZE, fetchAppointmentClientPage, type AppointmentClientOption } from './doctor-scheduling-repository';

type SyntheticPatient = AppointmentClientOption & {
  deleted_at: string | null;
  visible: boolean;
  eligible: boolean;
};

const patient = (index: number, patch: Partial<SyntheticPatient> = {}): SyntheticPatient => ({
  id: `patient-${String(index).padStart(3, '0')}`,
  full_name: `Client ${String(index).padStart(3, '0')}`,
  patient_number: `BS-${String(index).padStart(3, '0')}`,
  phone: `050000${String(index).padStart(4, '0')}`,
  slug: `client-${String(index).padStart(3, '0')}`,
  deleted_at: null,
  visible: true,
  eligible: true,
  ...patch,
});

function syntheticDatabase(rows: SyntheticPatient[]) {
  const calls = { rpcs: [] as { name: string; args: Record<string, unknown> }[] };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.rpcs.push({ name, args });
    if (name !== 'appointment_patient_options') return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
    const selectedId = String(args.selected_patient || '');
    const search = String(args.search_text || '').toLowerCase();
    const offset = Number(args.page_offset || 0);
    const pageSize = Number(args.page_size || APPOINTMENT_CLIENT_PAGE_SIZE);
    let data = rows.filter(row => row.visible && row.deleted_at === null && row.eligible);
    data = data.filter(row => row.id === selectedId || !search || [row.full_name, row.patient_number, row.phone].some(value => String(value || '').toLowerCase().includes(search)));
    data = [...data].sort((left, right) => Number(right.id === selectedId) - Number(left.id === selectedId) || left.full_name.localeCompare(right.full_name) || left.id.localeCompare(right.id));
    data = data.slice(offset, offset + pageSize);
    return { data: data.map(({ deleted_at: _deletedAt, visible: _visible, eligible: _eligible, ...row }) => row), error: null };
  };

  return { database: { rpc }, calls };
}

describe('Release 1B appointment client selection', () => {
  it('pages through more than forty eligible clients and reaches a client outside the former first forty', async () => {
    const { database } = syntheticDatabase(Array.from({ length: 55 }, (_, index) => patient(index + 1)));

    const first = await fetchAppointmentClientPage(database, { pageSize: APPOINTMENT_CLIENT_PAGE_SIZE });
    const second = await fetchAppointmentClientPage(database, { offset: first.nextOffset, pageSize: APPOINTMENT_CLIENT_PAGE_SIZE });
    const third = await fetchAppointmentClientPage(database, { offset: second.nextOffset, pageSize: APPOINTMENT_CLIENT_PAGE_SIZE });

    expect(first.patients).toHaveLength(25);
    expect(second.patients).toHaveLength(25);
    expect(second.patients.map(row => row.id)).toContain('patient-046');
    expect(third.patients).toHaveLength(5);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
  });

  it('finds a newly converted eligible client by name and retains an out-of-page selection without duplication', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => patient(index + 1));
    const { database } = syntheticDatabase(rows);
    rows.push(patient(51, { full_name: 'Newly Converted Client' }));

    const page = await fetchAppointmentClientPage(database, {
      query: 'Newly Converted',
      selectedPatient: 'patient-002',
    });

    expect(page.patients.map(row => row.id)).toEqual(['patient-002', 'patient-051']);
    const selectedSearch = await fetchAppointmentClientPage(database, { query: 'Newly Converted', selectedPatient: 'patient-051' });
    expect(selectedSearch.patients.filter(row => row.id === 'patient-051')).toHaveLength(1);
  });

  it('excludes RLS-hidden, deleted, and appointment-ineligible records', async () => {
    const { database } = syntheticDatabase([
      patient(1),
      patient(2, { visible: false }),
      patient(3, { eligible: false }),
      patient(4, { deleted_at: '2026-09-01T00:00:00Z' }),
    ]);

    const page = await fetchAppointmentClientPage(database);

    expect(page.patients.map(row => row.id)).toEqual(['patient-001']);
  });

  it('performs read-only selection without creating clients, reconverting leads, or changing CRM metrics', async () => {
    const convertedAt = '2026-09-20T09:30:00Z';
    const leads = [{ id: 'lead-1', converted_at: convertedAt }, { id: 'lead-2', converted_at: null }];
    const before = structuredClone(leads);
    const { database, calls } = syntheticDatabase([patient(1)]);

    await fetchAppointmentClientPage(database, { query: 'Client 001' });

    expect(leads).toEqual(before);
    expect(leads.filter(lead => lead.converted_at)).toHaveLength(1);
    expect(new Set(calls.rpcs.map(call => call.name))).toEqual(new Set(['appointment_patient_options']));
  });

  it('uses only current production schema contracts and exposes the bounded search controls', () => {
    const patientsMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0037_patient_records_and_documents.sql'), 'utf8');
    const accessMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260922140945_sales_coordinator_lead_client_access.sql'), 'utf8');
    const schedulerAccessMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260929141022_appointment_scheduler_client_access.sql'), 'utf8');
    const repository = readFileSync(resolve(process.cwd(), 'src/lib/doctor-scheduling-repository.ts'), 'utf8');
    const component = readFileSync(resolve(process.cwd(), 'src/components/doctor-scheduling.tsx'), 'utf8');
    const selectorRuntime = repository.slice(repository.indexOf('export async function fetchAppointmentClientPage'), repository.indexOf('export type DoctorPayload'));

    for (const column of ['id uuid primary key', 'patient_number text', 'full_name text', 'phone text', 'deleted_at timestamptz']) {
      expect(patientsMigration).toContain(column);
    }
    expect(patientsMigration).toContain('create policy "patient records access"');
    expect(accessMigration).toContain('function public.appointment_patient_access(action text, target_patient uuid)');
    expect(accessMigration).toContain("public.appointment_has_permission(action)");
    expect(accessMigration).toContain('public.patient_care_access(target_patient)');
    expect(schedulerAccessMigration).toContain("public.appointment_has_permission('create')");
    expect(schedulerAccessMigration).not.toContain('and public.patient_care_access(p.id)');
    expect(schedulerAccessMigration).toContain('p.deleted_at is null');
    expect(schedulerAccessMigration).toContain('p.archived_at is null');
    expect(selectorRuntime).toContain(".rpc('appointment_patient_options'");
    expect(selectorRuntime).toContain('page_offset: offset');
    expect(selectorRuntime).toContain('page_size: Math.min(100, pageSize + 1)');
    expect(selectorRuntime).not.toMatch(/\.from\('patients'\)|patient_sessions|finance|crm_leads|insert\(|update\(|delete\(/);
    expect(component).toContain('aria-label="Search clients"');
    expect(component).toContain('Load more clients');
    expect(repository).not.toContain('.limit(40)');
  });
});
