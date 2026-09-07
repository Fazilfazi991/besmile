import { attendanceDuration } from "./attendance-rules";
import { formatDistance } from "./attendance-geofence";

const clock = (value?: string | null) => value ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "";
const audit = (verified?: boolean | null, distance?: number | null) => verified === true ? `Verified${typeof distance === "number" ? ` (${formatDistance(distance)})` : ""}` : "Not verified";

export function attendanceExportRows(rows: any[], workDate: string, statusLabel: (row: any) => string) {
  return rows.map(row => {
    const result = attendanceDuration(row.attendance, { timeZone: "Asia/Kolkata", workDate });
    return { Employee: row.full_name, "Employee code": row.employee_code || "", Department: row.department?.name || "", Designation: row.designation || "", Date: workDate, Status: statusLabel(row), "Clock in": clock(row.attendance?.clock_in), "Clock out": clock(row.attendance?.clock_out), "Working minutes": result.minutes ?? "", "Break minutes": row.attendance?.break_minutes ?? "", "Clock-in location": audit(row.attendance?.clock_in_location_verified, row.attendance?.clock_in_distance_metres), "Clock-out location": audit(row.attendance?.clock_out_location_verified, row.attendance?.clock_out_distance_metres) };
  });
}

export function attendanceExportFilename(workDate: string) { return `bsmile-attendance-${workDate}.xlsx`; }
