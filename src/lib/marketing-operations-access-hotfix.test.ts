import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  adminRouteRequirement,
  employeeNavigation,
  filterNavigation,
  permissionAllows,
} from "./permission-access";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260929103338_marketing_operations_access.sql"),
  "utf8",
);

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  profile: vi.fn(),
  permission: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mock.auth },
    from: () => ({
      select: () => ({
        eq: () => ({ abortSignal: () => ({ maybeSingle: mock.profile }) }),
      }),
    }),
    rpc: (_name: string, args: { permission_code: string }) => ({
      abortSignal: () => mock.permission(args.permission_code),
    }),
  }),
}));

import { middleware } from "../middleware";

describe("approved Marketing operations access", () => {
  beforeEach(() => {
    mock.auth.mockReset().mockResolvedValue({ data: { user: { id: "marketing-reviewer" } }, error: null });
    mock.profile.mockReset().mockResolvedValue({ data: { role: "staff", status: "active", is_employee: true }, error: null });
    mock.permission.mockReset().mockImplementation((code: string) => Promise.resolve({
      data: code === "daily_work.review_department",
      error: null,
    }));
  });

  it("resolves the two exact active internal profiles and grants the minimal operational set", () => {
    expect(migration).toContain("lower(profile.email) = 'bdmbsmile@gmail.com'");
    expect(migration).toContain("profile.designation = 'Marketing Manager'");
    expect(migration).toContain("lower(profile.email) = 'salescobsmile@gmail.com'");
    expect(migration).toContain("profile.designation = 'Marketing Coordinator'");
    expect(migration).toContain("insert into public.user_permission_grants");
    for (const permission of [
      "attendance.self",
      "crm.import",
      "crm.manage_all",
      "daily_work.review_department",
      "dashboard.view",
      "leads.convert_to_patient",
      "leads.create",
      "leads.edit",
      "patients.create",
      "patients.view_identity",
      "sales.edit",
    ]) expect(migration).toContain(`'${permission}'`);
  });

  it("does not grant unrelated administrative or destructive privileges", () => {
    const grantBlock = migration.slice(
      migration.indexOf("with target_profiles as"),
      migration.indexOf("create or replace function public.can_review_daily_work"),
    );
    expect(grantBlock).not.toMatch(/attendance\.manage|attendance\.view_team|crm\.delete|admin\.shell|finance\.|payroll\.|employees\.|clinical_notes|roles\.manage|permissions\.manage/i);
  });

  it("keeps Daily Work review department-scoped and ordinary writes owner-only", () => {
    expect(migration).toContain("subject.department_id = viewer.department_id");
    expect(migration).toContain("public.has_permission('daily_work.review_department')");
    expect(migration).toContain("public.has_permission('attendance.view')");
    expect(migration).not.toMatch(/drop policy[^]*daily work updates created by owner/i);
    expect(migration).not.toMatch(/drop policy[^]*daily work updates edited by owner/i);
  });

  it("shows the review link and opens only the dedicated review route", async () => {
    const permissions = new Set(["daily_work.review_department"]);
    const links = filterNavigation(employeeNavigation, permissions).flatMap((group) => group.links);
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Daily Work Update", href: "/employee/daily-work" }),
      expect.objectContaining({ label: "Daily Work Reports", href: "/admin/daily-work" }),
    ]));
    expect(permissionAllows(permissions, adminRouteRequirement("/admin/daily-work"))).toBe(true);

    const review = await middleware(new NextRequest("http://localhost/admin/daily-work"));
    expect(review.headers.get("x-middleware-next")).toBe("1");
    const attendance = await middleware(new NextRequest("http://localhost/admin/attendance"));
    expect(attendance.headers.get("location")).toBe("http://localhost/unauthorized");
  });
});
