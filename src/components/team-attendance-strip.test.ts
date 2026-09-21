import { describe, expect, it } from 'vitest';
import { teamAttendanceState } from '@/lib/team-attendance-state';

describe('team attendance state', () => {
  it('uses leave, then clock-out, break, and present in attendance priority order', () => {
    expect(teamAttendanceState({ clock_out: '2026-08-09T10:00:00Z' }, true).label).toBe('On Leave');
    expect(teamAttendanceState({ clock_out: '2026-08-09T10:00:00Z' }).label).toBe('Punch-Out Recorded');
    expect(teamAttendanceState({ attendance_breaks: [{ started_at: new Date().toISOString(), ended_at: null }] }).label).toBe('On Break');
    expect(teamAttendanceState({ clock_in: '2026-08-09T09:00:00Z', attendance_breaks: [] }).label).toBe('Present');
  });
  it('uses a neutral missing Punch-In state when attendance is unavailable', () => expect(teamAttendanceState(null).label).toBe('Punch-In Not Recorded'));
});
