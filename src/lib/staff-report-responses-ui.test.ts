import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { staffReportResponseError } from './staff-report-responses';

const component = readFileSync('src/components/staff-report-responses.tsx', 'utf8');
const employeePage = readFileSync('src/app/employee/tasks/page.tsx', 'utf8');
const adminPage = readFileSync('src/app/admin/tasks/page.tsx', 'utf8');
const employeeDailyWork = readFileSync('src/app/employee/daily-work/page.tsx', 'utf8');
const adminDailyWork = readFileSync('src/app/admin/daily-work/page.tsx', 'utf8');
const styles = readFileSync('src/app/globals.css', 'utf8');

describe('private staff report response UI', () => {
  it('places the action and responder details directly beneath each eligible report', () => {
    expect(component).toContain('Add Response / Reply');
    expect(component).toContain('response.responder_profile?.full_name');
    expect(component).toContain('new Date(response.created_at).toLocaleString()');
    expect(employeePage).toContain('<StaffReportResponses');
    expect(adminPage).toContain('<StaffReportResponses');
    expect(employeeDailyWork).toContain('source="daily_work_update"');
    expect(adminDailyWork).toContain('source="daily_work_update"');
  });

  it('states the privacy audience and supports responsive Standard and Colorful presentation', () => {
    expect(component).toContain('Visible only to this staff member, Managing Director, and Chairman');
    expect(styles).toContain('html[data-theme="colorful"] .staff-report-responses');
    expect(styles).toContain('@media(max-width:640px){.staff-report-response>div');
  });

  it('validates blank and oversized response text', () => {
    expect(staffReportResponseError('   ')).toBe('Enter a response before saving.');
    expect(staffReportResponseError('x'.repeat(2001))).toContain('2,000');
    expect(staffReportResponseError('Approved response')).toBe('');
  });
});
