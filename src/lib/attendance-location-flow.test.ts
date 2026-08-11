import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const selfAttendanceSurfaces = [
  "src/app/admin/page.tsx",
  "src/app/employee/dashboard/page.tsx",
  "src/app/employee/attendance/page.tsx",
].map(read);

describe("self-attendance location flow integration", () => {
  it("uses the shared fresh location flow for both clock in and clock out", () => {
    for (const source of selfAttendanceSurfaces) {
      expect(source).toContain("freshLocation('Clock In')");
      expect(source).toContain("freshLocation('Clock Out')");
      expect(source).toContain("locationCheckingMessage");
    }
  });

  it("guards every self-attendance surface against repeated actions", () => {
    for (const source of selfAttendanceSurfaces) {
      expect(source).toContain("attendanceRequest.current");
      expect(source).toMatch(/attendanceRequest\.current\s*=\s*true/);
      expect(source).toMatch(/attendanceRequest\.current\s*=\s*false/);
    }
  });

  it("keeps the trusted attendance RPC authoritative", () => {
    const repository = read("src/lib/employee-repository.ts");
    expect(repository).toMatch(/rpc\(\s*["']record_self_attendance_location["']/);
    expect(repository).toMatch(/p_action:\s*["']clock_in["']/);
    expect(repository).toMatch(/p_action:\s*["']clock_out["']/);
    expect(repository).toContain("attendanceRpcError(error.message)");
  });
});
