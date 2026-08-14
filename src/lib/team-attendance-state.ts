export type TeamAttendanceRecord = { clock_in?: string | null; clock_out?: string | null; attendance_breaks?: { started_at: string; ended_at?: string | null }[] } | null | undefined;
export function teamAttendanceState(attendance: TeamAttendanceRecord, onLeave = false) {
  if (onLeave) return { label: 'On Leave', detail: undefined, tone: 'leave' };
  if (!attendance) return { label: 'Not Clocked In', detail: undefined, tone: 'neutral' };
  if (attendance.clock_out) return { label: 'Clocked Out', detail: `Out ${formatTime(attendance.clock_out)}`, tone: 'clocked-out' };
  const activeBreak = attendance.attendance_breaks?.find((item) => !item.ended_at);
  if (activeBreak) return { label: 'On Break', detail: breakDuration(activeBreak.started_at), tone: 'break' };
  return { label: 'Present', detail: attendance.clock_in ? `In ${formatTime(attendance.clock_in)}` : undefined, tone: 'present' };
}
export function teamAttendanceDisplayState(attendance: TeamAttendanceRecord, onLeave = false, attendanceAvailable = true, leaveAvailable = true) {
  if (!attendanceAvailable) return { label: 'Attendance unavailable', detail: undefined, tone: 'neutral' };
  return teamAttendanceState(attendance, leaveAvailable ? onLeave : false);
}
function formatTime(value: string) { return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function breakDuration(value: string) { return `${Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000))} min`; }
