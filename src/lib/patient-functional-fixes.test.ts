import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync(new URL('../components/patient-workspace.tsx', import.meta.url), 'utf8');
const patientUi = readFileSync(new URL('../components/patient-ui.tsx', import.meta.url), 'utf8');
const patientList = readFileSync(new URL('../components/patient-list.tsx', import.meta.url), 'utf8');
const manageApi = readFileSync(new URL('../app/api/patients/[patientId]/manage/route.ts', import.meta.url), 'utf8');

describe('patient functional fixes', () => {
  it('uses source dropdowns on add and edit patient forms', () => {
    expect(patientUi).toContain('Select source');
    expect(workspace).toContain('Select source');
    expect(patientUi).toContain('patientSourceOptions.map');
    expect(workspace).toContain('patientSourceOptions.map');
  });

  it('preserves legacy source values in the edit dropdown', () => {
    expect(workspace).toContain('Legacy: {legacySource}');
    expect(workspace).toContain('isLegacyPatientSource(p.source)');
  });

  it('saves patient edits through the internal UUID route with loading and success feedback', () => {
    expect(workspace).toContain('fetch(`/api/patients/${p.id}/manage`');
    expect(workspace).toContain('Patient details updated successfully.');
    expect(workspace).toContain("saving === 'patient' ? 'Saving...'");
    expect(manageApi).toContain(".eq('id',patientId)");
    expect(manageApi).toContain('normalizePatientSource(payload.source)');
    expect(manageApi).toContain('editablePatientFields');
  });

  it('uses the same canonical profile form for list edits and protects scoped updates', () => {
    expect(patientList).toContain("?edit=1");
    expect(workspace).toContain("params.get('edit') === '1'");
    expect(manageApi).toContain("db.from('patients').select('id').eq('id',patientId)");
    expect(manageApi).toContain("allowed(db,'patients.assign')");
    expect(manageApi).toContain('updated_by:user.id');
  });

  it('redirects created patients to their canonical slug with success state', () => {
    expect(patientUi).toContain(".select('id,slug').single()");
    expect(patientUi).toContain("location.href = `/admin/patients/${data.slug || data.id}?created=1`");
    expect(workspace).toContain("params.get('created') === '1' ? 'Patient created successfully.'");
  });
});
