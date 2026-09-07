import { describe, expect, it } from "vitest";
import { attendanceExportFilename, attendanceExportRows } from "./attendance-export";

describe("attendance Excel export", () => {
  it("exports exactly the supplied filtered rows", () => {
    const rows = attendanceExportRows([{ full_name: "A", employee_code: "E1", department: { name: "Ops" }, attendance: null, on_leave: false }], "2026-09-08", () => "Absent");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Employee: "A", "Employee code": "E1", Department: "Ops", Date: "2026-09-08", Status: "Absent" });
    expect(attendanceExportRows([], "2026-09-08", () => "Absent")).toEqual([]);
  });
  it("uses a meaningful xlsx filename", () => expect(attendanceExportFilename("2026-09-08")).toBe("bsmile-attendance-2026-09-08.xlsx"));
});
