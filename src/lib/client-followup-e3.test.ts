import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeLeaveTypes, isActiveLeaveType } from './leave-rules';
import { operationalReportRangeError, operationalReportRangeLabel, operationalReportTimestampBounds } from './operational-report-range';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('client follow-up E3', () => {
  it('validates applied report ranges independently from draft input', () => {
    expect(operationalReportRangeError({ from: '', to: '' })).toBe('');
    expect(operationalReportRangeError({ from: '2026-09-01', to: '' })).toMatch(/both a start date/i);
    expect(operationalReportRangeError({ from: '2026-09-14', to: '2026-09-01' })).toMatch(/on or before/i);
    expect(operationalReportRangeError({ from: '2026-09-01', to: '2026-09-14' })).toBe('');
  });

  it('uses exact Asia/Kolkata day bounds for timestamp-backed reports', () => {
    expect(operationalReportTimestampBounds({ from: '2026-09-01', to: '2026-09-02' })).toEqual({
      fromInclusive: '2026-08-31T18:30:00.000Z',
      toExclusive: '2026-09-02T18:30:00.000Z',
      timeZone: 'Asia/Kolkata',
    });
    expect(operationalReportRangeLabel({ from: '2026-09-01', to: '2026-09-02' })).toBe('1 Sept 2026 – 2 Sept 2026');
  });

  it('keeps Annual Leave historical but removes it from active controls', () => {
    const types = [
      { code: 'annual', name: 'Annual Leave', is_active: true },
      { code: 'sick', name: 'Sick Leave', is_active: true },
      { code: 'legacy', name: 'Annual Leave', is_active: null },
      { code: 'casual', name: 'Casual Leave', is_active: false },
    ];
    expect(isActiveLeaveType(types[0])).toBe(false);
    expect(activeLeaveTypes(types).map(type => type.code)).toEqual(['sick']);
    expect(read('supabase/migrations/20260908195341_attendance_regularization_and_leave_configuration.sql')).toContain("where code = 'annual' and is_active");
    expect(read('src/app/employee/leaves/page.tsx')).toContain("request.leave_types?.name || request.leave_type");
  });

  it('keeps report queries, exports, and responsive rendering on the same applied range', () => {
    const reports = read('src/components/operational-reports.tsx');
    expect(reports).toContain('draftRange');
    expect(reports).toContain('appliedRange');
    expect(reports).toContain('operationalReportRangeError(draftRange)');
    expect(reports).toContain("context: { from: appliedRange.from || 'all', to: appliedRange.to || 'all'");
    expect(reports).toContain('operational-report-mobile');
    expect(reports).toContain(".select('employee_code,full_name,designation,status,joining_date,manager_id,department:departments(name)')");
    expect(reports).toContain(".select('id,full_name').in('id',managerIds)");
    expect(reports).not.toContain('manager:profiles!profiles_manager_id_fkey');
  });

  it('uses non-color holiday cues and a recursive mobile organization hierarchy', () => {
    const css = read('src/app/e3-ui.css');
    const chart = read('src/components/profile-organization-chart.tsx');
    expect(css).toContain(".holiday-chip.holiday:before{content:'◆'}");
    expect(css).toContain(".holiday-chip.awareness:before{content:'●'}");
    expect(css).toContain(".holiday-chip.observance:before{content:'✦'}");
    expect(css).toContain(".holiday-date.weekly-off:after");
    expect(chart).toContain('className="organization-chart-tree"');
    expect(chart).toContain('OrganizationBranch key={root.id}');
    expect(chart).not.toContain('mobileCard("director")');
  });

  it('defines complete Colorful Mode surfaces for every E3 workspace', () => {
    const css = read('src/app/e3-ui.css');
    for (const selector of ['task-management-workspace', 'leave-self-service', 'leave-workspace', 'attendance-workspace', 'admin-attendance-workspace', 'daily-work-workspace', 'operational-reports', 'organization-notifications', 'holiday-calendar', 'chat-hub']) {
      expect(css).toContain(selector);
    }
    expect(css).toContain('#f4f7ff');
    expect(css).toContain('#b9c5e6');
    expect(css).toContain('min-height:44px');
  });
});
