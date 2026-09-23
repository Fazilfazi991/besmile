import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  employeeNavigation,
  employeeRouteRequirement,
  filterNavigation,
  permissionAllows,
} from "./permission-access";
import { permissionCatalogue } from "./permission-catalogue";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const migration = read(
  "supabase/migrations/20260922140945_sales_coordinator_lead_client_access.sql",
);
const repository = read("src/lib/employee-repository.ts");
const patientList = read("src/components/patient-list.tsx");
const patientWorkspace = read("src/components/patient-workspace.tsx");

describe("Sales Coordinator lead and client access", () => {
  it("grants narrow CRM access plus the canonical employee self-service baseline", () => {
    expect(migration).toContain("'Operations Sales Coordinator'");
    expect(migration).toContain("bundle.department_name = 'Operations'");
    expect(migration).toContain("bundle.designation = 'Sales Coordinator'");
    for (const permission of [
      "'leads.view_all'",
      "'patients.view_identity'",
      "'dashboard.view'",
      "'attendance.self'",
      "'leave.self'",
      "'tasks.view_self'",
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).toContain("on conflict do nothing");

    const bundleGrant = migration.slice(
      migration.indexOf("insert into public.designation_permission_bundle_permissions"),
      migration.indexOf("create or replace function public.crm_lead_can_view"),
    );
    expect(bundleGrant).not.toMatch(
      /crm\.manage_all|admin\.shell|leads\.assign|crm\.delete|patients\.edit|patients\.create|finance\.|payroll\.|attendance\.manage|attendance\.view_team|leave\.approve|leave\.review|leave\.manage|employees\.manage/,
    );
  });

  it("preserves the live defaulted two-argument CRM helper signature", () => {
    expect(migration).toMatch(
      /crm_lead_can_view\(\s*target uuid,\s*clinical_client uuid default null\s*\)/i,
    );
    expect(migration).toContain(
      "public.crm_lead_can_view(assigned_to, null::uuid)",
    );
    expect(migration).toContain(
      "drop function if exists public.crm_lead_can_view(uuid)",
    );
    expect(migration).not.toContain(
      "create or replace function public.crm_lead_can_view(target uuid)",
    );
  });

  it("allows all lead reads and edits while preserving field-level guards", () => {
    expect(migration).toContain("public.has_permission('leads.view_all')");
    expect(migration).toContain(
      "public.has_permission('leads.view_all')\n      and public.has_permission('leads.edit')",
    );
    expect(repository).not.toContain('.eq("assigned_to", userId)');
    expect(migration).not.toMatch(/grant\s+all|disable\s+row level security/i);
  });

  it("keeps identity access outside every care-data boundary", () => {
    expect(migration).toContain(
      "public.has_permission('patients.view_identity')",
    );
    expect(migration).toContain(
      "create or replace function public.patient_care_access",
    );
    expect(migration).toContain(
      "public.appointment_has_permission(action)\n    and public.patient_care_access(target_patient)",
    );
    expect(migration).toContain(
      "deleted_at is null and public.patient_care_access(patient_id)",
    );
    expect(migration).toContain(
      "public.patient_care_access(doc.patient_id)",
    );
    expect(migration).toContain("uploaded_by = auth.uid()");
    expect(patientWorkspace).toContain(
      "const hasCareAccess = !!careResult.data",
    );
    expect(patientWorkspace).toContain(
      "canViewCareWorkspace ? ['Overview', 'Appointments', 'Sessions', 'Documents', 'Notes', 'Activity'] : ['Overview']",
    );
    expect(patientList).toContain("const onlyIdentity =");
  });

  it("exposes the correct employee routes without an admin shell", () => {
    const permissions = new Set([
      "leads.view_all",
      "patients.view_identity",
      "dashboard.view",
      "attendance.self",
      "leave.self",
      "tasks.view_self",
    ]);
    expect(
      permissionAllows(
        permissions,
        employeeRouteRequirement("/employee/crm/leads"),
      ),
    ).toBe(true);
    expect(
      permissionAllows(
        permissions,
        employeeRouteRequirement("/employee/patients"),
      ),
    ).toBe(true);
    const labels = filterNavigation(employeeNavigation, permissions).flatMap(
      (group) => group.links.map((link) => link.label),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "My Attendance",
        "Holiday Calendar",
        "Leave",
        "Tasks",
        "Profile",
        "My Leads",
        "My Follow-ups",
        "Clients",
      ]),
    );
    expect(labels).not.toContain("Employees");
    expect(permissionCatalogue).toEqual(
      expect.arrayContaining(["leads.view_all", "patients.view_identity"]),
    );
  });
});
