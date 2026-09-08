import { attendanceDuration } from "./attendance-rules";
import { formatDistance } from "./attendance-geofence";

const clock = (value?: string | null, timeZone = "Asia/Kolkata") => value ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(new Date(value)) : "";
const audit = (verified?: boolean | null, distance?: number | null) => verified === true ? `Verified${typeof distance === "number" ? ` (${formatDistance(distance)})` : ""}` : "Not verified";

export function attendanceExportRows(rows: any[], workDate: string, statusLabel: (row: any) => string, timeZone = "Asia/Kolkata") {
  return rows.map(row => {
    const result = attendanceDuration(row.attendance, { timeZone: "Asia/Kolkata", workDate });
    return { Employee: row.full_name, "Employee code": row.employee_code || "", Department: row.department?.name || "", Designation: row.designation || "", Date: workDate, Status: statusLabel(row), "Punch in": clock(row.attendance?.clock_in, timeZone), "Punch out": clock(row.attendance?.clock_out, timeZone), "Total working hours": result.minutes === null ? "" : `${Math.floor(result.minutes / 60)}h ${String(result.minutes % 60).padStart(2, "0")}m`, "Break minutes": row.attendance?.break_minutes ?? "", "Clock-in location": audit(row.attendance?.clock_in_location_verified, row.attendance?.clock_in_distance_metres), "Clock-out location": audit(row.attendance?.clock_out_location_verified, row.attendance?.clock_out_distance_metres) };
  });
}

export function attendanceExportFilename(workDate: string) { return `bsmile-attendance-${workDate}.xlsx`; }
