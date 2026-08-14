import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { teamAttendanceDisplayState, teamAttendanceState } from '@/lib/team-attendance-state';

const strip = readFileSync(new URL('./team-attendance-strip.tsx', import.meta.url), 'utf8');

describe('team attendance state', () => {
  it('uses leave, then clock-out, break, and present in attendance priority order', () => {
    expect(teamAttendanceState({ clock_out: '2026-08-09T10:00:00Z' }, true).label).toBe('On Leave');
    expect(teamAttendanceState({ clock_out: '2026-08-09T10:00:00Z' }).label).toBe('Clocked Out');
    expect(teamAttendanceState({ attendance_breaks: [{ started_at: new Date().toISOString(), ended_at: null }] }).label).toBe('On Break');
    expect(teamAttendanceState({ clock_in: '2026-08-09T09:00:00Z', attendance_breaks: [] }).label).toBe('Present');
  });
  it('uses a neutral not-clocked-in state when attendance is unavailable', () => expect(teamAttendanceState(null).label).toBe('Not Clocked In'));
  it('shows attendance unavailable without inventing a status', () => expect(teamAttendanceDisplayState({ clock_in: '2026-08-09T09:00:00Z' }, false, false, true).label).toBe('Attendance unavailable'));
  it('uses attendance but not leave when leave data is unavailable', () => expect(teamAttendanceDisplayState({ clock_in: '2026-08-09T09:00:00Z' }, true, true, false).label).toBe('Present'));
  it('keeps attendance unavailable when both sources are unavailable', () => expect(teamAttendanceDisplayState(null, true, false, false).label).toBe('Attendance unavailable'));
  it('does not fabricate focus or progress copy', () => {
    expect(strip).not.toContain("Today&apos;s focus");
    expect(strip).not.toContain('On track');
  });
});
