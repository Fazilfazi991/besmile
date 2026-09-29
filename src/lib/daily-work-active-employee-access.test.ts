import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  adminRouteRequirement,
  employeeNavigation,
  employeeRouteRequirement,
  filterNavigation,
  permissionAllows,
} from "./permission-access";

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

const dailyWorkMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260907203658_daily_work_updates.sql"),
  "utf8",
);

const request = () =>
  middleware(new NextRequest("http://localhost/employee/daily-work"));

describe("Daily Work Update access for active internal employees", () => {
  beforeEach(() => {
    mock.auth.mockReset().mockResolvedValue({
      data: { user: { id: "active-internal-user" } },
      error: null,
    });
    mock.profile.mockReset().mockResolvedValue({
      data: { role: "staff", status: "active", is_employee: true },
      error: null,
    });
    mock.permission.mockReset().mockResolvedValue({ data: false, error: null });
  });

  it.each([
    ["Marketing Sales Coordinator", "guest_sales"],
    ["Operations Sales Coordinator", "guest_sales"],
    ["ordinary staff", "staff"],
    ["psychologist", "psychologist"],
  ])("allows an active internal %s without attendance permissions", async (_label, role) => {
    mock.profile.mockResolvedValue({
      data: { role, status: "active", is_employee: true },
      error: null,
    });

    const response = await request();

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mock.permission).not.toHaveBeenCalled();
  });

  it("keeps the route and desktop/mobile sidebar entry independent of permissions", () => {
    expect(employeeRouteRequirement("/employee/daily-work")).toBeUndefined();
    expect(permissionAllows(new Set(), employeeRouteRequirement("/employee/daily-work"))).toBe(true);
    const dailyWorkLink = filterNavigation(employeeNavigation, new Set())
      .flatMap((group) => group.links)
      .find((link) => link.href === "/employee/daily-work");
    expect(dailyWorkLink?.label).toBe("Daily Work Update");
    expect(dailyWorkLink?.requirement).toBeUndefined();
  });

  it.each(["inactive", "terminated"])("rejects %s profiles", async (status) => {
    mock.profile.mockResolvedValue({
      data: { role: "staff", status, is_employee: true },
      error: null,
    });
    expect((await request()).headers.get("location")).toBe(
      "http://localhost/sign-in?inactive=1",
    );
  });

  it("rejects external non-employees from the employee shell", async () => {
    mock.profile.mockResolvedValue({
      data: { role: "psychologist", status: "active", is_employee: false },
      error: null,
    });
    expect((await request()).headers.get("location")).toBe(
      "http://localhost/clinician/schedule",
    );
  });

  it("rejects unauthenticated requests", async () => {
    mock.auth.mockResolvedValue({ data: { user: null }, error: null });
    expect((await request()).headers.get("location")).toBe(
      "http://localhost/sign-in",
    );
  });

  it("preserves owner-only writes and scoped management reads in RLS", () => {
    expect(dailyWorkMigration).toContain("profile_id = (select auth.uid())");
    expect(dailyWorkMigration).toContain("public.has_permission('attendance.manage')");
    expect(dailyWorkMigration).toContain(
      "public.has_permission('attendance.view') and public.in_management_tree(profile_id)",
    );
    expect(dailyWorkMigration).not.toMatch(/for (insert|update)[\s\S]*attendance\.(self|view_self)/i);
  });

  it("leaves the management route permission contract unchanged", () => {
    expect(permissionAllows(new Set(), adminRouteRequirement("/admin/daily-work"))).toBe(false);
    expect(
      permissionAllows(
        new Set(["attendance.view"]),
        adminRouteRequirement("/admin/daily-work"),
      ),
    ).toBe(true);
    expect(
      permissionAllows(
        new Set(["attendance.manage"]),
        adminRouteRequirement("/admin/daily-work"),
      ),
    ).toBe(true);
  });
});
