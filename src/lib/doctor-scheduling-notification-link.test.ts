import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scheduling = readFileSync(resolve(process.cwd(), 'src/components/doctor-scheduling.tsx'), 'utf8');
const employeePage = readFileSync(resolve(process.cwd(), 'src/app/employee/doctor-scheduling/page.tsx'), 'utf8');
const notifications = readFileSync(resolve(process.cwd(), 'src/app/employee/notifications/page.tsx'), 'utf8');

describe('appointment notification deep links', () => {
  it('opens the referenced appointment and maps the management route for employees', () => {
    expect(scheduling).toContain('initialAppointmentId');
    expect(scheduling).toContain('appointmentRows.find((item: any) => item.id === initialAppointmentId)');
    expect(employeePage).toContain('initialAppointmentId={params.appointment}');
    expect(notifications).toContain("link.replace('/admin/doctor-scheduling', '/employee/doctor-scheduling')");
  });
});
