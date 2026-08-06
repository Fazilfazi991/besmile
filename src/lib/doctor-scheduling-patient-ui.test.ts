import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const component = readFileSync(resolve(process.cwd(), 'src/components/doctor-scheduling.tsx'), 'utf8');

describe('patient appointment profile UI', () => {
  it('keeps appointment management actions embedded in the patient profile tab', () => {
    for (const text of ['Schedule Appointment', 'Schedule First Appointment', 'Edit', 'Reschedule', 'Confirm', 'Complete', 'No Show', 'Cancel', 'Delete']) {
      expect(component).toContain(text);
    }
    expect(component).toContain('No appointments have been scheduled for this patient yet.');
    expect(component).toContain('doctorSchedulingRepository.createAppointment');
    expect(component).toContain('doctorSchedulingRepository.updateAppointment');
    expect(component).toContain('doctorSchedulingRepository.deleteAppointment');
  });
});
